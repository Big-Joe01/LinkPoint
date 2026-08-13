import { api } from '../lib/api';

export interface Wallet {
  availableMinor: string;
  availableMajor: number;
  pendingMinor: string;
  pendingMajor: number;
  currency: string;
}

export interface WalletTxn {
  id: string;
  type: string;
  status: string;
  amountMinor: string;
  currency: string;
  reference: string;
  source: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export const walletApi = {
  get: () => api.get<Wallet>('/wallet'),
  fund: (amount: number) =>
    api.post<{ txRef: string; paymentLink?: string; accountNumber?: string; bankName?: string; accountName?: string }>(
      '/wallet/fund',
      { amount },
    ),
  transactions: (page = 1) =>
    api.get<Paginated<WalletTxn>>('/wallet/transactions', { page, pageSize: 20 }),
  withdraw: (input: { bankAccountId: string; amount: number }) =>
    api.post<{ reference: string; status: string }>('/wallet/withdraw', input),
  banks: () => api.get<{ id: string; name: string }[]>('/wallet/banks'),
  addBank: (input: { bankCode: string; accountNumber: string }) =>
    api.post<{ id: string; accountName: string }>('/wallet/bank-accounts', input),
};
