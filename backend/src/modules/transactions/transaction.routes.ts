import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, parseOr400, unauthorized } from '../../lib/errors';
import { makeOfferSchema } from '@linkpoint/validation';
import { TransactionStatus, WalletTxnType, WalletTxnStatus, PropertyStatus, MilestoneStatus } from '../../../prisma/generated/client';
import { toMinor } from '@linkpoint/shared';
import { debitWallet, creditWallet } from '../../lib/wallet-ledger';
import { computeTransactionCommission, validateAffiliateQualification } from './commission.service';
import { audit } from '../../lib/audit';
import { getSetting } from '../../lib/settings';
import { z } from 'zod';
import { nanoid } from 'nanoid';

async function makeOffer(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(makeOfferSchema, req.body);

  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw notFound('Property not found');
  if (property.status !== PropertyStatus.ACTIVE && property.status !== PropertyStatus.UNDER_OFFER) {
    throw badRequest('Property not available for offers');
  }
  if (property.ownerId === req.user.id) throw badRequest('Cannot make an offer on your own property');

  const amountMinor = BigInt(toMinor(input.amount));
  const offer = await prisma.offer.create({
    data: {
      propertyId: input.propertyId,
      buyerId: req.user.id,
      amountMinor,
      currency: property.currency,
      note: input.note,
      status: 'PENDING',
    },
  });
  await prisma.property.update({ where: { id: input.propertyId }, data: { status: PropertyStatus.UNDER_OFFER } });
  await audit('OFFER_CREATE', { userId: req.user.id, req, resource: 'Offer', resourceId: offer.id });
  return { id: offer.id, status: offer.status, amountMinor: amountMinor.toString() };
}

const acceptOfferSchema = z.object({});

async function acceptOffer(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { offerId } = req.params as { offerId: string };
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { property: true } });
  if (!offer) throw notFound('Offer not found');
  if (offer.property.ownerId !== req.user.id) throw forbidden('Not the seller');
  if (offer.status !== 'PENDING') throw badRequest('Offer already processed');

  // Create the transaction from the accepted offer.
  const commission = await computeTransactionCommission({
    amountMinor: offer.amountMinor,
    affiliateCommissionPct: offer.property.affiliateEnabled ? offer.property.affiliateCommissionPct : null,
  });

  const transaction = await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        propertyId: offer.propertyId,
        buyerId: offer.buyerId,
        sellerId: req.user.id,
        amountMinor: offer.amountMinor,
        currency: offer.currency,
        linkpointCommissionMinor: commission.linkpointCommissionMinor,
        affiliateCommissionMinor: commission.affiliateCommissionMinor,
        status: TransactionStatus.INITIATED,
        agreementVersion: '1.0',
      },
    });
    await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', transactionId: t.id } });
    // Create default milestones.
    const milestones = [
      { code: 'BUYER_FUNDS', label: 'Buyer Funds Transaction' },
      { code: 'SELLER_ACCEPTS', label: 'Seller Accepts' },
      { code: 'DOCUMENTATION', label: 'Documentation Completed' },
      { code: 'HANDOVER', label: 'Final Verification & Handover' },
    ];
    for (let i = 0; i < milestones.length; i++) {
      await tx.transactionMilestone.create({
        data: { transactionId: t.id, code: milestones[i].code, label: milestones[i].label, status: MilestoneStatus.PENDING },
      });
    }
    return t;
  });

  await audit('OFFER_ACCEPTED', { userId: req.user.id, req, resource: 'Transaction', resourceId: transaction.id });
  return { transactionId: transaction.id, status: transaction.status };
}

const acceptTransactionSchema = z.object({ as: z.enum(['BUYER', 'SELLER']) });

/**
 * Digital acceptance — both buyer and seller must digitally accept.
 * Records timestamp, user, IP for legal traceability.
 */
async function acceptTransaction(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const input = acceptTransactionSchema.parse(req.body);
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) throw notFound('Transaction not found');

  const ip = req.ip;
  if (input.as === 'BUYER') {
    if (transaction.buyerId !== req.user.id) throw forbidden('Not the buyer');
    await prisma.transaction.update({ where: { id }, data: { buyerAcceptedAt: new Date(), buyerIp: ip } });
  } else {
    if (transaction.sellerId !== req.user.id) throw forbidden('Not the seller');
    await prisma.transaction.update({ where: { id }, data: { sellerAcceptedAt: new Date(), sellerIp: ip } });
  }
  await audit('TRANSACTION_ACCEPT', { userId: req.user.id, req, resource: 'Transaction', resourceId: id, metadata: { as: input.as, ip } });
  return { id, acceptedAs: input.as };
}

/**
 * Buyer funds the transaction — escrow-style. Funds moved from buyer wallet
 * into a pending hold on the transaction. Released only on completion.
 */
async function fundTransaction(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) throw notFound('Transaction not found');
  if (transaction.buyerId !== req.user.id) throw forbidden('Not the buyer');
  if (!transaction.buyerAcceptedAt || !transaction.sellerAcceptedAt) {
    throw badRequest('Both parties must digitally accept before funding');
  }
  if (transaction.status !== TransactionStatus.INITIATED) throw badRequest('Transaction not fundable');

  const reference = `TXN-FUND-${transaction.id}`;
  // Debit buyer, credit a SYSTEM hold (the transaction escrow). Idempotent by reference.
  await debitWallet(
    {
      userId: req.user.id,
      amountMinor: transaction.amountMinor,
      reference,
      type: WalletTxnType.PAYMENT,
      source: 'TRANSACTION',
      status: WalletTxnStatus.COMPLETED,
      metadata: { transactionId: transaction.id, stage: 'escrow_funded' },
    },
  );

  await prisma.transaction.update({ where: { id }, data: { status: TransactionStatus.FUNDED, fundedAt: new Date() } });
  await audit('TRANSACTION_FUNDED', { userId: req.user.id, req, resource: 'Transaction', resourceId: id });
  return { id, status: TransactionStatus.FUNDED };
}

const completeMilestoneSchema = z.object({});

async function completeMilestone(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { transactionId, milestoneId } = req.params as { transactionId: string; milestoneId: string };
  const milestone = await prisma.transactionMilestone.findUnique({
    where: { id: milestoneId },
    include: { transaction: true },
  });
  if (!milestone) throw notFound('Milestone not found');
  const isParty = milestone.transaction.buyerId === req.user.id || milestone.transaction.sellerId === req.user.id;
  const isAdmin = (req.user.roles as string[]).includes('ADMIN');
  if (!isParty && !isAdmin) throw forbidden('Not authorized');

  const updated = await prisma.transactionMilestone.update({
    where: { id: milestoneId },
    data: { status: MilestoneStatus.COMPLETED, completedAt: new Date() },
  });
  await audit('MILESTONE_COMPLETE', { userId: req.user.id, req, resource: 'TransactionMilestone', resourceId: milestoneId });
  return { id: milestoneId, status: updated.status };
}

/**
 * Finalize the transaction. Funds released ONLY when:
 * - transaction is FUNDED
 * - all milestones COMPLETED
 * - both parties digitally accepted
 * On completion: LinkPoint commission + affiliate commission credited to their
 * respective wallets; seller receives the remainder.
 */
async function completeTransaction(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { milestones: true, property: true },
  });
  if (!transaction) throw notFound('Transaction not found');
  const isAdmin = (req.user.roles as string[]).includes('ADMIN');
  if (transaction.buyerId !== req.user.id && transaction.sellerId !== req.user.id && !isAdmin) {
    throw forbidden('Not authorized');
  }
  if (transaction.status !== TransactionStatus.FUNDED) throw badRequest('Transaction must be funded first');
  if (!transaction.buyerAcceptedAt || !transaction.sellerAcceptedAt) throw badRequest('Missing digital acceptance');
  const allComplete = transaction.milestones.every((m) => m.status === MilestoneStatus.COMPLETED);
  if (!allComplete) throw badRequest('Not all milestones completed');

  // Re-validate affiliate qualification (commission only on REAL completion).
  const affiliate = await validateAffiliateQualification(id);

  await prisma.$transaction(async (tx) => {
    // Credit seller proceeds (escrow hold -> seller wallet).
    await creditWallet(
      {
        userId: transaction.sellerId,
        amountMinor: transaction.amountMinor - transaction.linkpointCommissionMinor - transaction.affiliateCommissionMinor,
        reference: `TXN-SELL-${transaction.id}`,
        type: WalletTxnType.PAYMENT,
        source: 'TRANSACTION',
        status: WalletTxnStatus.COMPLETED,
        metadata: { transactionId: transaction.id, stage: 'seller_proceeds' },
      },
      tx,
    );
    // LinkPoint commission is retained by the platform from the escrowed funds.
    // No wallet credit needed — the buyer's funds were already debited at funding.
    // We record it as a COMMISSION ledger entry against the seller's wallet (a
    // bookkeeping record with zero net effect, since the seller was credited the
    // net amount already). This keeps every commission auditable.
    if (transaction.linkpointCommissionMinor > 0n) {
      await tx.walletTransaction.create({
        data: {
          walletId: (await tx.wallet.findUnique({ where: { userId: transaction.sellerId } }))!.id,
          userId: transaction.sellerId,
          type: WalletTxnType.COMMISSION,
          status: WalletTxnStatus.COMPLETED,
          amountMinor: transaction.linkpointCommissionMinor,
          reference: `TXN-LP-${transaction.id}`,
          source: 'TRANSACTION',
          metadata: { transactionId: transaction.id, pct: (Number(transaction.linkpointCommissionMinor) * 100) / Number(transaction.amountMinor), platformRevenue: true } as never,
        },
      });
    }
    // Affiliate commission (only if qualified — real completed deal).
    if (affiliate.qualifies) {
      const affLink = await tx.affiliateLink.findUnique({ where: { id: affiliate.affiliateLinkId } });
      if (affLink) {
        await creditWallet(
          {
            userId: affLink.affiliateId,
            amountMinor: affiliate.commissionMinor,
            reference: `TXN-AFF-${transaction.id}`,
            type: WalletTxnType.COMMISSION,
            source: 'AFFILIATE',
            status: WalletTxnStatus.COMPLETED,
            metadata: { transactionId: transaction.id, pct: affiliate.commissionPct },
          },
          tx,
        );
        // Record the conversion on the affiliate link (real analytics only).
        await tx.affiliateLink.update({
          where: { id: affLink.id },
          data: { conversions: { increment: 1 }, commissionEarnedMinor: { increment: affiliate.commissionMinor } },
        });
      }
    }
    await tx.transaction.update({ where: { id }, data: { status: TransactionStatus.COMPLETED, completedAt: new Date() } });
    // Mark property sold/rented.
    await tx.property.update({ where: { id: transaction.propertyId }, data: { status: PropertyStatus.SOLD } });
  });

  await audit('TRANSACTION_COMPLETE', { userId: req.user.id, req, resource: 'Transaction', resourceId: id });
  return { id, status: TransactionStatus.COMPLETED, affiliatePaid: affiliate.qualifies };
}

async function listMyTransactions(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const items = await prisma.transaction.findMany({
    where: { OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }] },
    include: {
      property: { select: { title: true, city: true, state: true } },
      milestones: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

async function getTransaction(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { property: true, milestones: { orderBy: { code: 'asc' } }, offer: true },
  });
  if (!transaction) throw notFound('Transaction not found');
  const isParty = transaction.buyerId === req.user.id || transaction.sellerId === req.user.id;
  const isAdmin = (req.user.roles as string[]).includes('ADMIN');
  if (!isParty && !isAdmin) throw forbidden('Not authorized');
  return {
    ...transaction,
    amountMinor: transaction.amountMinor.toString(),
    linkpointCommissionMinor: transaction.linkpointCommissionMinor.toString(),
    affiliateCommissionMinor: transaction.affiliateCommissionMinor.toString(),
    linkpointCommissionMajor: Number(transaction.linkpointCommissionMinor) / 100,
  };
}

export function registerTransactionRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/offers`, { preHandler: app.authenticate, handler: makeOffer as never });
  app.post(`${prefix}/offers/:offerId/accept`, { preHandler: app.authenticate, handler: acceptOffer as never });
  app.get(`${prefix}/transactions`, { preHandler: app.authenticate, handler: listMyTransactions as never });
  app.get(`${prefix}/transactions/:id`, { preHandler: app.authenticate, handler: getTransaction as never });
  app.post(`${prefix}/transactions/:id/accept`, { preHandler: app.authenticate, handler: acceptTransaction as never });
  app.post(`${prefix}/transactions/:id/fund`, { preHandler: app.authenticate, handler: fundTransaction as never });
  app.post(`${prefix}/transactions/:transactionId/milestones/:milestoneId/complete`, { preHandler: app.authenticate, handler: completeMilestone as never });
  app.post(`${prefix}/transactions/:id/complete`, { preHandler: app.authenticate, handler: completeTransaction as never });
}
