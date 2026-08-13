import { prisma } from './prisma';
import { WalletTxnStatus, WalletTxnType } from '../../prisma/generated/client';
import { logger } from './logger';

// Wallet ledger service. Balance is derived from completed ledger entries.
// Every money movement is atomic, auditable, and idempotent via unique reference.

// Minimal client interface satisfied by both PrismaClient and an interactive transaction client.
interface LedgerClient {
  wallet: {
    findUnique(args: { where: { userId: string } }): Promise<{ id: string; balanceMinor: bigint; pendingMinor: bigint } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  walletTransaction: {
    findUnique(args: { where: { reference: string } }): Promise<{ id: string; status: WalletTxnStatus; amountMinor: bigint } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { reference: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface CreditInput {
  userId: string;
  amountMinor: bigint;
  reference: string; // unique idempotency key
  type: WalletTxnType;
  source?: string;
  destination?: string;
  metadata?: object;
  status?: WalletTxnStatus;
}

/**
 * Credit a wallet inside a Prisma transaction.
 * Idempotent: if the reference already exists, returns the existing row without re-crediting.
 */
export async function creditWallet(input: CreditInput, tx: LedgerClient = prisma as unknown as LedgerClient): Promise<{ txId: string; applied: boolean }> {
  const client = tx;
  const wallet = await client.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw new Error(`Wallet not found for user ${input.userId}`);

  const existing = await client.walletTransaction.findUnique({ where: { reference: input.reference } });
  if (existing) {
    return { txId: existing.id, applied: false };
  }

  const status = input.status ?? WalletTxnStatus.COMPLETED;
  const txn = await client.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: input.userId,
      type: input.type,
      status,
      amountMinor: input.amountMinor,
      reference: input.reference,
      source: input.source,
      destination: input.destination,
      metadata: (input.metadata ?? null) as never,
    },
  });

  if (status === WalletTxnStatus.COMPLETED) {
    await client.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: { increment: input.amountMinor } },
    });
  } else if (status === WalletTxnStatus.PENDING) {
    await client.wallet.update({
      where: { id: wallet.id },
      data: { pendingMinor: { increment: input.amountMinor } },
    });
  }

  return { txId: txn.id, applied: true };
}

export interface DebitInput {
  userId: string;
  amountMinor: bigint;
  reference: string;
  type: WalletTxnType;
  source?: string;
  destination?: string;
  metadata?: object;
  status?: WalletTxnStatus;
}

/**
 * Debit a wallet inside a Prisma transaction. Reserves funds if status PENDING.
 * Idempotent by reference. Throws if insufficient available balance for COMPLETED debits.
 */
export async function debitWallet(input: DebitInput, tx: LedgerClient = prisma as unknown as LedgerClient): Promise<{ txId: string; applied: boolean }> {
  const client = tx;
  const wallet = await client.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw new Error(`Wallet not found for user ${input.userId}`);

  const existing = await client.walletTransaction.findUnique({ where: { reference: input.reference } });
  if (existing) {
    return { txId: existing.id, applied: false };
  }

  const status = input.status ?? WalletTxnStatus.COMPLETED;
  if (status === WalletTxnStatus.COMPLETED && wallet.balanceMinor < input.amountMinor) {
    throw new Error('Insufficient available balance');
  }

  const txn = await client.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: input.userId,
      type: input.type,
      status,
      amountMinor: input.amountMinor,
      reference: input.reference,
      source: input.source,
      destination: input.destination,
      metadata: (input.metadata ?? null) as never,
    },
  });

  if (status === WalletTxnStatus.COMPLETED) {
    await client.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: { decrement: input.amountMinor } },
    });
  } else if (status === WalletTxnStatus.PENDING) {
    // reserve funds by moving them out of available into pending
    if (wallet.balanceMinor < input.amountMinor) {
      throw new Error('Insufficient available balance for reservation');
    }
    await client.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceMinor: { decrement: input.amountMinor },
        pendingMinor: { increment: input.amountMinor },
      },
    });
  }

  return { txId: txn.id, applied: true };
}

/**
 * Reconcile a wallet's cached balance against the ledger.
 * The ledger is the source of truth — this recomputes the derived balance.
 */
export async function reconcileWallet(userId: string): Promise<{ available: bigint; pending: bigint }> {
  const txns = await prisma.walletTransaction.findMany({
    where: { userId },
    select: { status: true, type: true, amountMinor: true },
  });
  let available = 0n;
  let pending = 0n;
  for (const t of txns) {
    if (t.status === WalletTxnStatus.COMPLETED) {
      if (isCredit(t.type)) available += t.amountMinor;
      else available -= t.amountMinor;
    } else if (t.status === WalletTxnStatus.PENDING) {
      if (isCredit(t.type)) pending += t.amountMinor;
      else pending -= t.amountMinor;
    }
  }
  if (available < 0n) {
    logger.warn({ userId, available: available.toString() }, 'Wallet reconcile produced negative balance — ledger inconsistency');
  }
  await prisma.wallet.update({
    where: { userId },
    data: { balanceMinor: available, pendingMinor: pending },
  });
  return { available, pending };
}

function isCredit(type: WalletTxnType): boolean {
  return (
    type === WalletTxnType.DEPOSIT ||
    type === WalletTxnType.COMMISSION ||
    type === WalletTxnType.REFUND ||
    type === WalletTxnType.PAYOUT
  );
}
