'use client';

import Link from 'next/link';
import { ErrorBanner, LoadingBlock, PageHeader, StatCard } from '@/components/PageHeader';
import { cn, formatBytes, formatDate, useAdminData } from '@/lib/hooks';
import type { CacheStats, DbStats, ProviderInfo, ProviderList, Stats } from '@/lib/types';

function health(provider: ProviderInfo): { label: string; tone: string; dot: string } {
  if (!provider.enabled) return { label: 'Disabled', tone: 'badge-gray', dot: 'bg-slate-400' };
  if (provider.errorCount > 0) return { label: 'Degraded', tone: 'badge-red', dot: 'bg-red-400' };
  if (provider.lastSuccess) return { label: 'Healthy', tone: 'badge-green', dot: 'bg-emerald-400' };
  return { label: 'Untested', tone: 'badge-yellow', dot: 'bg-amber-400' };
}

export default function DashboardPage() {
  const stats = useAdminData<Stats>('/stats');
  const providers = useAdminData<ProviderList>('/providers');
  const cache = useAdminData<CacheStats>('/cache/stats');
  const db = useAdminData<DbStats>('/db/stats');

  const error = stats.error ?? providers.error ?? cache.error ?? db.error;
  const total = stats.data?.totals;
  const topTitles = stats.data?.topTitles ?? [];
  const maxPlays = topTitles[0]?.plays ?? 1;
  const providerList = providers.data?.providers ?? [];

  function refreshAll() {
    void stats.reload();
    void providers.reload();
    void cache.reload();
    void db.reload();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Control room"
        subtitle="Provider health, stream volume, and audience activity at a glance."
        actions={
          <>
            <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/40">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
            <button type="button" className="btn btn-ghost" onClick={refreshAll}>
              Refresh
            </button>
          </>
        }
      />

      <ErrorBanner message={error} />

      {stats.loading && !stats.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card p-5">
              <div className="skeleton mb-4 h-3 w-24" />
              <div className="skeleton h-8 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Streams today"
            value={String(total?.today ?? 0)}
            hint={`${total?.week ?? 0} in the last 7 days`}
            accent="indigo"
          />
          <StatCard
            label="Last 30 days"
            value={String(total?.month ?? 0)}
            hint="All tracked playback sessions"
            accent="emerald"
          />
          <StatCard
            label="Active now"
            value={String(stats.data?.activeUsers ?? 0)}
            hint="Distinct fingerprints in the last 5 minutes"
            accent="amber"
          />
          <StatCard
            label="Provider error rate"
            value={`${((stats.data?.errorRate ?? 0) * 100).toFixed(1)}%`}
            hint={`${stats.data?.providerErrors ?? 0} accumulated provider errors`}
            accent={(stats.data?.errorRate ?? 0) > 0.1 ? 'red' : 'indigo'}
          />
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-bold text-white">Provider health</h2>
              <p className="mt-0.5 text-[11.5px] text-white/35">Live enable state and scrape history</p>
            </div>
            <Link href="/providers" className="text-[11.5px] font-semibold text-indigo-300 hover:text-indigo-200">
              Manage →
            </Link>
          </div>

          {providers.loading && !providers.data ? (
            <LoadingBlock rows={4} />
          ) : providerList.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-white/35">No providers registered.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {providerList.map((provider) => {
                const state = health(provider);
                return (
                  <div
                    key={provider.id}
                    className="rounded-[11px] border border-white/[0.07] bg-white/[0.025] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state.dot)} />
                        <span className="truncate text-[12.5px] font-semibold text-white/85">
                          {provider.name}
                        </span>
                      </div>
                      <span className={cn('badge', state.tone)}>{state.label}</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-white/30">
                      <span>{provider.errorCount} errors</span>
                      <span>Last success {formatDate(provider.lastSuccess).toLowerCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-bold text-white">Top titles</h2>
              <p className="mt-0.5 text-[11.5px] text-white/35">Most played across all sources</p>
            </div>
            <Link href="/users" className="text-[11.5px] font-semibold text-indigo-300 hover:text-indigo-200">
              Audience →
            </Link>
          </div>

          {topTitles.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-white/35">No streams tracked yet.</p>
          ) : (
            <ol className="space-y-3">
              {topTitles.slice(0, 6).map((title, index) => (
                <li key={title.title}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12px] text-white/75">
                      <span className="mr-2 text-[10px] font-bold text-white/25">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {title.title}
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-white/35">
                      {title.plays} {title.plays === 1 ? 'play' : 'plays'}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-300"
                      style={{ width: `${Math.max(6, (title.plays / maxPlays) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Cache backend</p>
          <p className="mt-2 text-[15px] font-bold capitalize text-white">
            {cache.data?.backend ?? '—'}
          </p>
          <p className="mt-1 text-[10.5px] text-white/30">{cache.data?.keys ?? 0} keys cached</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Cache hit rate</p>
          <p className="mt-2 text-[15px] font-bold text-white">
            {cache.data && cache.data.hits + cache.data.misses > 0
              ? `${Math.round((cache.data.hits / (cache.data.hits + cache.data.misses)) * 100)}%`
              : '—'}
          </p>
          <p className="mt-1 text-[10.5px] text-white/30">
            {cache.data?.hits ?? 0} hits · {cache.data?.misses ?? 0} misses
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Database</p>
          <p className="mt-2 text-[15px] font-bold text-white">{db.data?.sessions ?? 0} sessions</p>
          <p className="mt-1 text-[10.5px] text-white/30">{formatBytes(db.data?.sizeBytes ?? 0)} on disk</p>
        </div>
        <Link href="/settings" className="card card-hover flex flex-col justify-between p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">System</p>
          <p className="mt-2 text-[15px] font-bold text-white">Settings →</p>
          <p className="mt-1 text-[10.5px] text-white/30">Branding, maintenance, password</p>
        </Link>
      </section>
    </div>
  );
}
