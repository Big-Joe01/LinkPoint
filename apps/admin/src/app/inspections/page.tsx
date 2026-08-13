'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface InspectionRow {
  id: string;
  status: string;
  fee: string;
  agentCommission: string;
  createdAt: string;
  customerName: string;
  agentName?: string | null;
  propertyTitle: string;
}
interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; hasNext: boolean; }

export default function InspectionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'inspections'],
    queryFn: () => api<Paginated<InspectionRow>>('/admin/inspections'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Inspections</h1>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : data && data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Fee</th>
                <th className="px-4 py-3 text-left">Agent Commission</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i: InspectionRow) => (
                <tr key={i.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-ink">{i.propertyTitle}</td>
                  <td className="px-4 py-3 text-gray-600">{i.customerName}</td>
                  <td className="px-4 py-3 text-gray-600">{i.agentName ?? 'Unassigned'}</td>
                  <td className="px-4 py-3 text-gray-600">{i.status}</td>
                  <td className="px-4 py-3 text-gray-600">{i.fee}</td>
                  <td className="px-4 py-3 text-gray-600">{i.agentCommission}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-gray-500">No inspections booked yet.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
