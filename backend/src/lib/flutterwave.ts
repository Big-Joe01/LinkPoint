import { config } from '../config/env';
import { logger } from './logger';
import { prisma } from './prisma';

// Flutterwave API abstraction. All sensitive operations happen server-side only.
// Implements: payment init, payment verification, bank transfer (virtual account),
// payout (withdrawal), and webhook signature verification.
// Reference: https://developer.flutterwave.com/v3.0

export interface PaymentInitResult {
  flwRef: string;
  paymentLink?: string;
  status: string;
  virtualAccount?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
}

export interface PaymentVerification {
  success: boolean;
  amount: number; // major
  currency: string;
  reference: string;
  status: string;
  raw?: unknown;
}

export interface PayoutResult {
  success: boolean;
  reference: string;
  message?: string;
  raw?: unknown;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.flutterwave.secretKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Initialize a payment. Uses the charge/standard endpoint. For bank-transfer flow
 * this generates a dedicated virtual account for the transaction.
 */
export async function initializePayment(input: {
  amount: number; // major
  currency: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  txRef: string;
  redirectUrl?: string;
  paymentOptions?: string; // e.g. "card,accounttransfer,ussd"
  isBankTransfer?: boolean;
  metadata?: object;
}): Promise<PaymentInitResult> {
  if (!config.flutterwave.secretKey) {
    throw new Error('Flutterwave secret key not configured');
  }

  const body: Record<string, unknown> = {
    tx_ref: input.txRef,
    amount: input.amount,
    currency: input.currency,
    customer: {
      email: input.customerEmail,
      name: input.customerName,
      phonenumber: input.customerPhone ?? '',
    },
    payment_options: input.paymentOptions ?? 'card,accounttransfer,ussd,banktransfer',
    redirect_url: input.redirectUrl,
    meta: input.metadata,
  };

  // Bank-transfer / virtual-account flow uses the dedicated virtual account endpoint.
  if (input.isBankTransfer) {
    const va = await createVirtualAccount({
      txRef: input.txRef,
      amount: input.amount,
      currency: input.currency,
      email: input.customerEmail,
      name: input.customerName,
      phonenumber: input.customerPhone ?? '',
    });
    return {
      flwRef: input.txRef,
      status: 'PENDING',
      virtualAccount: {
        bankName: va.bankName,
        accountNumber: va.accountNumber,
        accountName: va.accountName,
      },
    };
  }

  const res = await fetch(`${config.flutterwave.apiBase}/payments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { status?: string; data?: { link?: string; flw_ref?: string } };
  if (json.status !== 'success' || !json.data?.link) {
    logger.error({ json }, 'Flutterwave payment init failed');
    throw new Error('Failed to initialize Flutterwave payment');
  }
  return { flwRef: json.data.flw_ref ?? input.txRef, paymentLink: json.data.link, status: 'PENDING' };
}

async function createVirtualAccount(input: {
  txRef: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  phonenumber: string;
}): Promise<{ bankName: string; accountNumber: string; accountName: string }> {
  const res = await fetch(`${config.flutterwave.apiBase}/virtual-account-numbers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      email: input.email,
      is_permanent: false,
      bvn: '00000000000',
      tx_ref: input.txRef,
      firstname: input.name.split(' ')[0] ?? input.name,
      lastname: input.name.split(' ').slice(1).join(' ') || 'LinkPoint',
      phonenumber: input.phonenumber || '00000000000',
      narration: `LinkPoint ${input.txRef}`,
      amount: input.amount,
      currency: input.currency,
    }),
  });
  const json = (await res.json()) as {
    status?: string;
    data?: { bank_name?: string; account_number?: string; account_name?: string };
  };
  if (json.status !== 'success' || !json.data?.account_number) {
    logger.error({ json }, 'Flutterwave virtual account creation failed');
    throw new Error('Failed to generate dedicated virtual account');
  }
  return {
    bankName: json.data.bank_name ?? '',
    accountNumber: json.data.account_number!,
    accountName: json.data.account_name ?? input.name,
  };
}

/** Verify a transaction by id or tx_ref. Never trust frontend callbacks. */
export async function verifyPayment(txRef: string): Promise<PaymentVerification> {
  if (!config.flutterwave.secretKey) {
    throw new Error('Flutterwave secret key not configured');
  }
  const res = await fetch(`${config.flutterwave.apiBase}/transactions/verify?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: headers(),
  });
  const json = (await res.json()) as {
    status?: string;
    data?: { amount?: number; currency?: string; tx_ref?: string; status?: string; amount_settled?: number };
  };
  if (json.status !== 'success' || !json.data) {
    return { success: false, amount: 0, currency: 'NGN', reference: txRef, status: 'FAILED', raw: json };
  }
  const status = json.data.status ?? '';
  return {
    success: status === 'successful',
    amount: json.data.amount ?? 0,
    currency: json.data.currency ?? 'NGN',
    reference: json.data.tx_ref ?? txRef,
    status,
    raw: json,
  };
}

/** Initiate a payout (withdrawal) to a bank account via Flutterwave transfers. */
export async function initiatePayout(input: {
  amount: number; // major
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  narration?: string;
}): Promise<PayoutResult> {
  if (!config.flutterwave.secretKey) {
    throw new Error('Flutterwave secret key not configured');
  }
  // Flutterwave requires a transfer recipient created first, then a transfer.
  const createRes = await fetch(`${config.flutterwave.apiBase}/transfers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      account_bank: input.bankCode,
      account_number: input.accountNumber,
      amount: input.amount,
      narration: input.narration ?? 'LinkPoint withdrawal',
      currency: input.currency,
      reference: input.reference,
      beneficiary_name: input.accountName,
    }),
  });
  const json = (await createRes.json()) as { status?: string; message?: string; data?: unknown };
  return {
    success: json.status === 'success',
    reference: input.reference,
    message: json.message,
    raw: json,
  };
}

/** Verify Flutterwave webhook signature (verifying-hash). */
export function verifyWebhookSignature(
  payload: Record<string, unknown>,
  signature: string | undefined,
): boolean {
  if (!config.flutterwave.webhookHash) {
    logger.warn('Flutterwave webhook hash not configured — rejecting webhook');
    return false;
  }
  if (!signature) return false;
  // Flutterwave signs with HMAC SHA256 of the JSON body using the secret hash,
  // sent in the "verifying-hash" header. We compare against the provided signature.
  return signature === config.flutterwave.webhookHash;
}

/** Resolve a bank account name from Flutterwave. */
export async function resolveBankAccount(bankCode: string, accountNumber: string): Promise<string | null> {
  if (!config.flutterwave.secretKey) return null;
  const res = await fetch(`${config.flutterwave.apiBase}/accounts/resolve`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
  });
  const json = (await res.json()) as { status?: string; data?: { account_name?: string } };
  if (json.status !== 'success') return null;
  return json.data?.account_name ?? null;
}

/** Idempotently record + process a webhook event. Returns true if newly processed. */
export async function recordWebhookEvent(
  provider: string,
  eventId: string,
  eventType: string,
  reference: string | null,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existing) return false;
  await prisma.webhookEvent.create({
    data: {
      provider,
      eventId,
      eventType,
      reference,
      payload: payload as never,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  });
  return true;
}
