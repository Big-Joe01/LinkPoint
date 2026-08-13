'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TransactionRow {
  id: string;
  reference: string;
  status: string;
  amount: string;
  currency: string;
  linkpointCommission: string;
  createdAt: string;
  buyerName?: string | null;
  sellerName?: string | null;
  propertyTitle: string;
}
interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean; }

export default function TransactionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'transactions'],
    queryFn: () => api<Paginated<TransactionRow>>('/admin/transactions'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Transactions</h1>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : data && data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Buyer</th>
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t: TransactionRow) => (
                <tr key={t.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-ink">{t.reference}</td>
                  <td className="px-4 py-3 text-gray-600">{t.propertyTitle}</td>
                  <td className="px-4 py-3 text-gray-600">{t.buyerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.sellerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.currency} {t.amount}</td>
                  <td className="px-4 py-3 text-gray-600">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="text-3xl mb-2">📄</div>
            <div className="text-gray-500">No transactions yet.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
