'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface WalletRow {
  id: string;
  user: { name: string; email: string };
  balance: string;
  pendingBalance: string;
  currency: string;
}
interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean; }

export default function WalletPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'wallets'],
    queryFn: () => api<Paginated<WalletRow>>('/admin/wallets'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Wallets</h1>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : data && data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Available</th>
                <th className="px-4 py-3 text-left">Pending</th>
                <th className="px-4 py-3 text-left">Currency</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w: WalletRow) => (
                <tr key={w.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-ink">{w.user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{w.user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{w.balance}</td>
                  <td className="px-4 py-3 text-gray-600">{w.pendingBalance}</td>
                  <td className="px-4 py-3 text-gray-600">{w.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="text-3xl mb-2">💰</div>
            <div className="text-gray-500">No wallets created yet.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
