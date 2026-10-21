'use client';

import { useMemo, useState } from 'react';
import { ErrorBanner, LoadingBlock, PageHeader, StatCard } from '@/components/PageHeader';
import { cn, formatDate, useAdminData } from '@/lib/hooks';
import type { SessionRow, SessionsResponse } from '@/lib/types';

interface Filters {
  from: string;
  to: string;
  country: string;
  title: string;
  device: string;
}

const EMPTY: Filters = { from: '', to: '', country: '', title: '', device: '' };

function buildPath(filters: Filters): string {
  const params = new URLSearchParams({ limit: '500' });
  if (filters.from) params.set('from', `${filters.from}T00:00:00.000Z`);
  if (filters.to) params.set('to', `${filters.to}T23:59:59.999Z`);
  if (filters.country.trim()) params.set('country', filters.country.trim());
  if (filters.title.trim()) params.set('title', filters.title.trim());
  if (filters.device) params.set('device', filters.device);
  return `/sessions?${params.toString()}`;
}

function countBy(rows: SessionRow[], key: 'country' | 'device' | 'browser'): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key] || 'Unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function AudiencePage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const sessions = useAdminData<SessionsResponse>(buildPath(applied));
  const rows = sessions.data?.sessions ?? [];

  const countries = useMemo(() => countBy(rows, 'country'), [rows]);
  const devices = useMemo(() => countBy(rows, 'device'), [rows]);
  const browsers = useMemo(() => countBy(rows, 'browser'), [rows]);
  const maxCountry = countries[0]?.[1] ?? 1;

  function update(field: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    setApplied(draft);
  }

  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
  }

  function exportCsv() {
    const header = ['timestamp', 'title', 'tmdbId', 'mediaType', 'provider', 'quality', 'country', 'city', 'device', 'browser', 'ip', 'fpHash'];
    const lines = rows.map((row) =>
      header
        .map((key) => {
          const value = row[key as keyof SessionRow] ?? '';
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `peakmovies-audience-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Audience"
        title="Who is watching"
        subtitle="Fingerprint-level session log with geography, device, and playback context. Streams are tracked without viewer accounts."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => void sessions.reload()}>
              Refresh
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </button>
          </>
        }
      />

      <ErrorBanner message={sessions.error} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions shown" value={String(rows.length)} hint={applied === EMPTY ? 'All time' : 'Matching filters'} />
        <StatCard label="Countries" value={String(countries.length)} hint={countries[0] ? `${countries[0][0]} leads` : 'No data'} accent="emerald" />
        <StatCard
          label="Mobile share"
          value={`${rows.length ? Math.round(((devices.find(([name]) => name === 'mobile')?.[1] ?? 0) / rows.length) * 100) : 0}%`}
          hint={`${devices.find(([name]) => name === 'mobile')?.[1] ?? 0} mobile sessions`}
          accent="amber"
        />
        <StatCard
          label="Desktop share"
          value={`${rows.length ? Math.round(((devices.find(([name]) => name === 'desktop')?.[1] ?? 0) / rows.length) * 100) : 0}%`}
          hint={`${browsers[0]?.[0] ?? 'No browser data'}`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <form onSubmit={apply} className="card p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="label" htmlFor="from">From</label>
                <input id="from" type="date" className="input" value={draft.from} onChange={(event) => update('from', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="to">To</label>
                <input id="to" type="date" className="input" value={draft.to} onChange={(event) => update('to', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="country">Country</label>
                <input id="country" className="input" placeholder="Australia" value={draft.country} onChange={(event) => update('country', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="title">Title</label>
                <input id="title" className="input" placeholder="Breaking Bad" value={draft.title} onChange={(event) => update('title', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="device">Device</label>
                <select id="device" className="input" value={draft.device} onChange={(event) => update('device', event.target.value)}>
                  <option value="">Any</option>
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                  <option value="tablet">Tablet</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={reset}>Reset</button>
              <button type="submit" className="btn btn-primary">Apply filters</button>
            </div>
          </form>

          {sessions.loading && <LoadingBlock rows={6} />}

          {!sessions.loading && (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
                <h2 className="text-[13px] font-bold text-white">Session log</h2>
                <span className="text-[10.5px] text-white/30">{rows.length} rows · newest first</span>
              </div>
              {rows.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <p className="text-[13px] font-semibold text-white/65">No sessions match</p>
                  <p className="mt-1 text-[11.5px] text-white/30">Try widening the date range or clearing filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Title</th>
                        <th>Source</th>
                        <th>Location</th>
                        <th>Device</th>
                        <th>Fingerprint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap text-[11px] text-white/40">{formatDate(row.timestamp)}</td>
                          <td>
                            <p className="max-w-[220px] truncate text-[12px] font-semibold text-white/85">{row.title ?? `TMDB ${row.tmdbId}`}</p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/25">
                              {row.mediaType} · TMDB {row.tmdbId}
                            </p>
                          </td>
                          <td>
                            <p className="text-[11px] text-white/60">{row.provider ?? 'none'}</p>
                            <p className="mt-0.5 text-[10px] text-white/30">{row.quality ?? '—'}</p>
                          </td>
                          <td>
                            <p className="text-[11px] text-white/60">{row.country ?? 'Unknown'}</p>
                            <p className="mt-0.5 text-[10px] text-white/30">
                              {[row.city, row.ip].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </td>
                          <td>
                            <span className={cn('badge', row.device === 'mobile' ? 'badge-amber' : row.device === 'tablet' ? 'badge-indigo' : 'badge-gray')}>
                              {row.device ?? 'unknown'}
                            </span>
                            <p className="mt-1.5 text-[10px] text-white/30">{row.browser ?? 'Unknown'}</p>
                          </td>
                          <td>
                            <span className="font-mono text-[10px] text-white/30" title={row.fpHash ?? ''}>
                              {row.fpHash ? `${row.fpHash.slice(0, 10)}…` : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h3 className="text-[12.5px] font-bold text-white">Top countries</h3>
            {countries.length === 0 ? (
              <p className="mt-3 text-[11px] text-white/30">No location data yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {countries.slice(0, 6).map(([name, count]) => (
                  <div key={name}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-white/60">{name}</span>
                      <span className="text-white/30">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-indigo-400/70" style={{ width: `${(count / maxCountry) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h3 className="text-[12.5px] font-bold text-white">Device mix</h3>
            <div className="mt-4 space-y-2.5">
              {['desktop', 'mobile', 'tablet'].map((device) => {
                const count = devices.find(([name]) => name === device)?.[1] ?? 0;
                return (
                  <div key={device} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]">
                    <span className="capitalize text-white/55">{device}</span>
                    <span className="font-semibold text-white/80">{count}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <h3 className="text-[12.5px] font-bold text-white">Browsers</h3>
            {browsers.length === 0 ? (
              <p className="mt-3 text-[11px] text-white/30">No browser data yet.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {browsers.slice(0, 8).map(([name, count]) => (
                  <span key={name} className="badge badge-gray">{name} · {count}</span>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
