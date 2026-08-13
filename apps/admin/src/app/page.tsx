'use client';

import { Shell } from '@/components/shell';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface StatsResponse {
  users?: { total?: number };
  properties?: { total?: number };
  inspections?: { total?: number };
  transactions?: { total?: number; volume?: number };
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-ink mt-1">{value}</div>
      {hint ? <div className="text-xs text-gray-400 mt-1">{hint}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<StatsResponse>('/admin/stats'),
    retry: false,
  });

  return (
    <Shell>
      <h1 className="text-xl font-bold text-ink mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Users" value={isLoading ? '…' : String(data?.users?.total ?? 0)} />
        <StatCard label="Properties" value={isLoading ? '…' : String(data?.properties?.total ?? 0)} />
        <StatCard label="Inspections" value={isLoading ? '…' : String(data?.inspections?.total ?? 0)} />
        <StatCard label="Transaction Volume" value={isLoading ? '…' : String(data?.transactions?.volume ?? 0)} hint="Total completed" />
      </div>
    </Shell>
  );
}
