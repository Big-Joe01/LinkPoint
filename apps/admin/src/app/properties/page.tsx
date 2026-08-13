'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PropertyRow {
  id: string;
  title: string;
  propertyType: string;
  purpose: string;
  price: string;
  currency: string;
  city: string;
  state: string;
  status: string;
  verificationStatus: string;
}
interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean; }

export default function PropertiesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'properties'],
    queryFn: () => api<Paginated<PropertyRow>>('/admin/properties'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Properties</h1>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : data && data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Purpose</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Verified</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p: PropertyRow) => (
                <tr key={p.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-ink">{p.title}</td>
                  <td className="px-4 py-3 text-gray-600">{p.propertyType}</td>
                  <td className="px-4 py-3 text-gray-600">{p.purpose}</td>
                  <td className="px-4 py-3 text-gray-600">{p.currency} {p.price}</td>
                  <td className="px-4 py-3 text-gray-600">{p.city}, {p.state}</td>
                  <td className="px-4 py-3 text-gray-600">{p.status}</td>
                  <td className="px-4 py-3 text-gray-600">{p.verificationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="text-3xl mb-2">🏘️</div>
            <div className="text-gray-500">No properties listed yet.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
