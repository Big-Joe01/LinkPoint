'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  roles: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
}
interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean; }

export default function UsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<Paginated<UserRow>>('/admin/users'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Users</h1>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : data && data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Verified</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u: UserRow) => (
                <tr key={u.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.roles}</td>
                  <td className="px-4 py-3 text-gray-600">{u.status}</td>
                  <td className="px-4 py-3 text-gray-600">{u.emailVerified ? 'Verified' : 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="text-3xl mb-2">👥</div>
            <div className="text-gray-500">No users registered yet.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
