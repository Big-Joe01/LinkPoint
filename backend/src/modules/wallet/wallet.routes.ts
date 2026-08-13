import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound, parseOr400, unauthorized } from '../../lib/errors';
import { fundWalletSchema, withdrawSchema } from '@linkpoint/validation';
import { WalletTxnType, WalletTxnStatus } from '../../../prisma/generated/client';
import { toMinor } from '@linkpoint/shared';
import { creditWallet, debitWallet } from '../../lib/wallet-ledger';
import { initializePayment, verifyPayment, initiatePayout, resolveBankAccount } from '../../lib/flutterwave';
import { audit } from '../../lib/audit';
import { getSetting } from '../../lib/settings';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { z } from 'zod';
import { nanoid } from 'nanoid';

/**
 * Fund wallet: backend creates the payment, Flutterwave returns a payment link or
 * dedicated virtual account. Wallet is credited ONLY after webhook verification —
 * never on frontend callback.
 */
async function fundWallet(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(fundWalletSchema, req.body);
  const currency = input.currency ?? 'NGN';
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw notFound('User not found');

  const txRef = `LW-${nanoid(16)}`;
  const amountMinor = BigInt(toMinor(input.amount));

  // Create a PENDING ledger entry up-front (idempotent by reference).
  await creditWallet({
    userId: user.id,
    amountMinor,
    reference: txRef,
    type: WalletTxnType.DEPOSIT,
    source: 'FLUTTERWAVE',
    status: WalletTxnStatus.PENDING,
    metadata: { amountMajor: input.amount, currency, stage: 'initiated' },
  });

  const init = await initializePayment({
    amount: input.amount,
    currency,
    customerEmail: user.email,
    customerName: user.name,
    customerPhone: user.phone,
    txRef,
    isBankTransfer: true, // dedicated virtual account flow where supported
    metadata: { userId: user.id, purpose: 'WALLET_FUND' },
  });

  await audit('WALLET_FUND_INIT', { userId: user.id, req, resource: 'WalletTransaction', resourceId: txRef });

  return {
    txRef,
    amount: input.amount,
    currency: input.currency,
    status: init.status,
    paymentLink: init.paymentLink,
    virtualAccount: init.virtualAccount,
    message: init.virtualAccount
      ? 'Transfer to the dedicated account below. Your wallet is credited after Flutterwave confirms the payment.'
      : 'Complete payment via the link. Your wallet is credited after verification.',
  };
}

/** Manually verify a payment (fallback for webhook delays). Still server-verified. */
async function verifyWalletFunding(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { txRef } = req.body as { txRef?: string };
  if (!txRef) throw badRequest('txRef required');

  const existing = await prisma.walletTransaction.findUnique({
    where: { reference: txRef },
  });
  if (!existing) throw notFound('Transaction not found');
  if (existing.status === WalletTxnStatus.COMPLETED) {
    return { txRef, status: 'COMPLETED', message: 'Already credited' };
  }

  const verification = await verifyPayment(txRef);
  if (!verification.success) {
    return { txRef, status: verification.status, message: 'Payment not yet confirmed' };
  }

  // Confirm amount matches expectation (anti-tampering).
  const expectedMinor = Number(existing.amountMinor);
  const actualMinor = toMinor(verification.amount);
  if (actualMinor < expectedMinor) {
    await audit('WALLET_FUND_AMOUNT_MISMATCH', { userId: req.user.id, req, metadata: { expectedMinor, actualMinor } });
    throw badRequest('Payment amount does not match');
  }

  // Promote PENDING -> COMPLETED atomically inside a transaction.
  await prisma.$transaction(async (tx) => {
    const pending = await tx.walletTransaction.findUnique({ where: { reference: txRef } });
    if (!pending || pending.status !== WalletTxnStatus.PENDING) return;
    // move from pending to available: pendingMinor--, balanceMinor++
    await tx.wallet.update({
      where: { id: pending.walletId },
      data: { pendingMinor: { decrement: pending.amountMinor }, balanceMinor: { increment: pending.amountMinor } },
    });
    await tx.walletTransaction.update({ where: { reference: txRef }, data: { status: WalletTxnStatus.COMPLETED } });
  });

  await audit('WALLET_FUND_COMPLETED', { userId: req.user.id, req, resource: 'WalletTransaction', resourceId: txRef });
  return { txRef, status: 'COMPLETED', message: 'Wallet credited' };
}

const addBankSchema = z.object({
  bankCode: z.string().min(2).max(20),
  bankName: z.string().min(2).max(120),
  accountNumber: z.string().min(8).max(20),
});

async function addBankAccount(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = addBankSchema.parse(req.body);
  // Verify account via Flutterwave where supported.
  const resolvedName = await resolveBankAccount(input.bankCode, input.accountNumber);
  const account = await prisma.bankAccount.create({
    data: {
      userId: req.user.id,
      bankCode: input.bankCode,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountName: resolvedName ?? input.accountNumber,
      verified: !!resolvedName,
    },
  });
  return account;
}

async function listBankAccounts(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  return prisma.bankAccount.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
}

async function withdraw(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(withdrawSchema, req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw notFound('User not found');
  if (!user.walletPinHash) throw badRequest('Set a wallet PIN first');
  const pinOk = await verifyPassword(input.pin, user.walletPinHash);
  if (!pinOk) throw unauthorized('Incorrect wallet PIN');

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, userId: req.user.id },
  });
  if (!bankAccount) throw notFound('Bank account not found');

  const minMinor = await getSetting('withdrawalMinMinor');
  const maxMinor = await getSetting('withdrawalMaxMinor');
  const amountMinor = BigInt(toMinor(input.amount));
  if (amountMinor < BigInt(minMinor)) throw badRequest(`Minimum withdrawal is ${minMinor / 100}`);
  if (amountMinor > BigInt(maxMinor)) throw badRequest(`Maximum withdrawal is ${maxMinor / 100}`);

  const reference = `WD-${nanoid(16)}`;
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  if (!wallet) throw notFound('Wallet not found');
  if (wallet.balanceMinor < amountMinor) throw badRequest('Insufficient available balance');

  // Reserve funds (PENDING debit), then initiate payout, then finalize.
  await debitWallet({
    userId: req.user.id,
    amountMinor,
    reference,
    type: WalletTxnType.WITHDRAWAL,
    source: 'FLUTTERWAVE',
    status: WalletTxnStatus.PENDING,
    destination: bankAccount.accountNumber,
    metadata: { bankAccountId: bankAccount.id },
  });

  const payout = await initiatePayout({
    amount: input.amount,
    currency: 'NGN',
    bankCode: bankAccount.bankCode,
    accountNumber: bankAccount.accountNumber,
    accountName: bankAccount.accountName,
    reference,
    narration: 'LinkPoint withdrawal',
  });

  if (!payout.success) {
    // Restore funds on failure.
    await prisma.$transaction(async (tx) => {
      const t = await tx.walletTransaction.findUnique({ where: { reference } });
      if (!t || t.status !== WalletTxnStatus.PENDING) return;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { pendingMinor: { decrement: amountMinor }, balanceMinor: { increment: amountMinor } },
      });
      await tx.walletTransaction.update({ where: { reference }, data: { status: WalletTxnStatus.FAILED } });
    });
    await audit('WALLET_WITHDRAW_FAILED', { userId: req.user.id, req, resource: 'WalletTransaction', resourceId: reference });
    throw badRequest(payout.message ?? 'Withdrawal failed');
  }

  // Mark completed.
  await prisma.$transaction(async (tx) => {
    const t = await tx.walletTransaction.findUnique({ where: { reference } });
    if (!t || t.status !== WalletTxnStatus.PENDING) return;
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { pendingMinor: { decrement: amountMinor } },
    });
    await tx.walletTransaction.update({ where: { reference }, data: { status: WalletTxnStatus.COMPLETED } });
  });

  await audit('WALLET_WITHDRAW', { userId: req.user.id, req, resource: 'WalletTransaction', resourceId: reference });
  return { reference, status: 'COMPLETED', message: 'Withdrawal initiated' };
}

async function walletBalance(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  if (!wallet) throw notFound('Wallet not found');
  return {
    availableMinor: wallet.balanceMinor.toString(),
    availableMajor: Number(wallet.balanceMinor) / 100,
    pendingMinor: wallet.pendingMinor.toString(),
    pendingMajor: Number(wallet.pendingMinor) / 100,
    currency: wallet.currency,
  };
}

async function walletHistory(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { page = 1, pageSize = 20 } = (req.query as { page?: number; pageSize?: number }) ?? {};
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletTransaction.count({ where: { userId: req.user.id } }),
  ]);
  return {
    items: items.map((t) => ({
      ...t,
      amountMinor: t.amountMinor.toString(),
      amountMajor: Number(t.amountMinor) / 100,
    })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}

export function registerWalletRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/wallet`, { preHandler: app.authenticate, handler: walletBalance as never });
  app.post(`${prefix}/wallet/fund`, { preHandler: app.authenticate, handler: fundWallet as never });
  app.post(`${prefix}/wallet/fund/verify`, { preHandler: app.authenticate, handler: verifyWalletFunding as never });
  app.post(`${prefix}/wallet/withdraw`, { preHandler: app.authenticate, handler: withdraw as never });
  app.get(`${prefix}/wallet/transactions`, { preHandler: app.authenticate, handler: walletHistory as never });
  app.get(`${prefix}/wallet/bank-accounts`, { preHandler: app.authenticate, handler: listBankAccounts as never });
  app.post(`${prefix}/wallet/bank-accounts`, { preHandler: app.authenticate, handler: addBankAccount as never });
}
