'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '../lib/hooks';

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'grid' },
  { href: '/providers', label: 'Providers', icon: 'server' },
  { href: '/test', label: 'Test scrape', icon: 'flask' },
  { href: '/users', label: 'Audience', icon: 'users' },
  { href: '/settings', label: 'Settings', icon: 'gear' },
] as const;

function NavIcon({ name }: { name: (typeof NAV)[number]['icon'] }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="4" width="18" height="7" rx="2" />
        <rect x="3" y="13" width="18" height="7" rx="2" />
        <circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6M10 3v5.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 8.5V3" />
        <path d="M7.5 14h9" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
        <path d="M16 5.2A3 3 0 0 1 16 11M17 14.6c2.2.4 3.9 2.3 3.9 4.7" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="h-[18px] w-[18px]">
      {paths[name]}
    </svg>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/admin/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
    }
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-white/[0.07] bg-[#090b12]/90 px-4 py-5 backdrop-blur lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <img src="/logo.svg" alt="" className="h-9 w-9 rounded-[10px]" />
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-bold tracking-tight">PeakMovies</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-300/70">
              Admin
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13px] font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85',
              )}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-white/[0.07] pt-4">
          <div className="mb-3 flex items-center gap-2 px-3 text-[11px] text-white/35">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Admin session active
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13px] font-medium text-white/50 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080910]/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold">PeakMovies</span>
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
              Admin
            </span>
          </Link>
          <button type="button" onClick={logout} className="text-[11px] font-medium text-white/45 hover:text-white">
            Sign out
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11.5px] font-medium',
                isActive(item.href) ? 'bg-indigo-500/15 text-indigo-200' : 'text-white/50',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:ml-[236px] lg:px-9 lg:py-8">{children}</main>
    </div>
  );
}
