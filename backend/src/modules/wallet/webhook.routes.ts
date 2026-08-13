import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { verifyWebhookSignature, recordWebhookEvent, verifyPayment } from '../../lib/flutterwave';
import { WalletTxnStatus } from '../../../prisma/generated/client';
import { toMinor } from '@linkpoint/shared';
import { logger } from '../../lib/logger';
import { audit } from '../../lib/audit';

/**
 * Flutterwave webhook. Idempotent + signature-verified.
 * Never trusts frontend callbacks alone — this is the source of truth for crediting.
 */
async function flutterwaveWebhook(req: FastifyRequest, reply: import('fastify').FastifyReply) {
  const signature = (req.headers['verifying-hash'] as string) || undefined;
  const payload = req.body as Record<string, unknown>;

  if (!verifyWebhookSignature(payload, signature)) {
    logger.warn({ ip: req.ip }, 'Flutterwave webhook signature verification failed');
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid signature' });
    return;
  }

  const eventType = (payload['event.type'] as string) || (payload['event'] as string) || 'unknown';
  const data = (payload['data'] as Record<string, unknown>) ?? {};
  const txRef = (data['tx_ref'] as string) || (data['reference'] as string);
  const eventId = (payload['event.id'] as string) || txRef || `${eventType}-${Date.now()}`;

  // Idempotency: skip if already processed.
  const isNew = await recordWebhookEvent('FLUTTERWAVE', eventId, eventType, txRef ?? null, payload);
  if (!isNew) {
    reply.code(200).send({ status: 'duplicate', message: 'Event already processed' });
    return;
  }

  // Only credit on successful charge or transfer completion.
  const isChargeSuccess = eventType.includes('charge') && (data['status'] === 'successful' || data['status'] === 'completed');
  const isTransferSuccess = eventType.includes('transfer') && data['status'] === 'SUCCESSFUL';

  if (isChargeSuccess && txRef) {
    const ledger = await prisma.walletTransaction.findUnique({ where: { reference: txRef } });
    if (ledger && ledger.status === WalletTxnStatus.PENDING) {
      // Verify the actual amount with Flutterwave before crediting.
      const verification = await verifyPayment(txRef);
      if (verification.success && toMinor(verification.amount) >= Number(ledger.amountMinor)) {
        await prisma.$transaction(async (tx) => {
          const t = await tx.walletTransaction.findUnique({ where: { reference: txRef } });
          if (!t || t.status !== WalletTxnStatus.PENDING) return;
          await tx.wallet.update({
            where: { id: t.walletId },
            data: { pendingMinor: { decrement: t.amountMinor }, balanceMinor: { increment: t.amountMinor } },
          });
          await tx.walletTransaction.update({ where: { reference: txRef }, data: { status: WalletTxnStatus.COMPLETED } });
        });
        await audit('WALLET_WEBHOOK_CREDIT', { resource: 'WalletTransaction', resourceId: txRef, metadata: { eventType } });
      } else {
        logger.warn({ txRef }, 'Webhook verification amount mismatch or failure — not crediting');
      }
    } else if (ledger && ledger.status === WalletTxnStatus.COMPLETED) {
      // already credited — idempotent no-op
    }
  }

  if (isTransferSuccess && txRef) {
    // Withdrawal transfer completed externally — ledger already COMPLETED at initiation.
    logger.info({ txRef }, 'Withdrawal transfer confirmed via webhook');
  }

  reply.code(200).send({ status: 'success' });
}

export function registerFlutterwaveWebhook(app: FastifyInstance, prefix: string): void {
  // Raw body parsing is handled by Fastify; signature uses the verifying-hash header.
  app.post(`${prefix}/webhooks/flutterwave`, {
    config: {
      rawBody: true,
    },
    handler: flutterwaveWebhook as never,
  });
}
