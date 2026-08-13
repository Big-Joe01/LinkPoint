'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode } from 'react';
import { clearToken } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/users', label: 'Users' },
  { href: '/properties', label: 'Properties' },
  { href: '/inspections', label: 'Inspections' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/transactions', label: 'Transactions' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = () => {
    clearToken();
    router.push('/login');
  };
  return (
    <aside className="w-60 bg-ink text-white flex flex-col min-h-screen">
      <div className="px-5 py-6">
        <div className="text-lg font-bold tracking-tight">LinkPoint</div>
        <div className="text-xs text-white/50">Admin Console</div>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm ${
                active ? 'bg-brand text-white' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="m-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 text-left"
      >
        Sign out
      </button>
    </aside>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
