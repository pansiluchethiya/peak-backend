'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorBanner, PageHeader } from '@/components/PageHeader';
import { adminFetch } from '@/lib/api';
import { cn, useAdminData } from '@/lib/hooks';
import type { ProviderList, TestResult } from '@/lib/types';

export function TestPanel() {
  const search = useSearchParams();
  const providers = useAdminData<ProviderList>('/providers');

  const [tmdbId, setTmdbId] = useState(search.get('tmdbId') ?? '27205');
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');
  const [provider, setProvider] = useState(search.get('provider') ?? '');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { tmdbId: tmdbId.trim(), type };
      if (type === 'tv') {
        body.season = Number.parseInt(season, 10) || 1;
        body.episode = Number.parseInt(episode, 10) || 1;
      }
      if (provider) body.provider = provider;
      const response = await adminFetch<TestResult>('/test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Test scrape failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Diagnostics"
        title="Test bench"
        subtitle="Run a live scrape and inspect every source, subtitle, and provider diagnostic before users see it."
      />

      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form onSubmit={run} className="card h-fit p-5">
          <h2 className="mb-4 text-[14px] font-bold text-white">Scrape parameters</h2>

          <div className="space-y-3.5">
            <div>
              <label className="label" htmlFor="tmdbId">
                TMDB ID
              </label>
              <input
                id="tmdbId"
                className="input font-mono"
                value={tmdbId}
                onChange={(event) => setTmdbId(event.target.value)}
                placeholder="27205"
                required
              />
            </div>

            <div>
              <span className="label">Media type</span>
              <div className="grid grid-cols-2 gap-2">
                {(['movie', 'tv'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={cn(
                      'rounded-[9px] border px-3 py-2 text-[12px] font-semibold capitalize transition-colors',
                      type === value
                        ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
                        : 'border-white/[0.09] bg-white/[0.025] text-white/45 hover:text-white/75',
                    )}
                  >
                    {value === 'tv' ? 'TV episode' : 'Movie'}
                  </button>
                ))}
              </div>
            </div>

            {type === 'tv' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="season">
                    Season
                  </label>
                  <input
                    id="season"
                    className="input"
                    type="number"
                    min={1}
                    value={season}
                    onChange={(event) => setSeason(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="episode">
                    Episode
                  </label>
                  <input
                    id="episode"
                    className="input"
                    type="number"
                    min={1}
                    value={episode}
                    onChange={(event) => setEpisode(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label" htmlFor="provider">
                Provider
              </label>
              <select
                id="provider"
                className="input"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="">All providers</option>
                {(providers.data?.providers ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.enabled ? '' : ' (disabled)'}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Scraping…' : 'Run scrape'}
            </button>
          </div>

          <p className="mt-4 border-t border-white/[0.07] pt-4 text-[10.5px] leading-relaxed text-white/25">
            Test scrapes bypass the stream cache and always hit the providers live.
          </p>
        </form>

        <div className="space-y-4">
          {!result && !loading && (
            <div className="card flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-indigo-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden="true">
                  <path d="M9 3h6M10 3v5.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 8.5V3" />
                  <path d="M7.5 14h9" />
                </svg>
              </div>
              <p className="text-[13px] font-semibold text-white/70">No scrape yet</p>
              <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-white/30">
                Choose a title and run the bench to see live provider output.
              </p>
            </div>
          )}

          {loading && (
            <div className="card space-y-3 p-5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-14 w-full" />
              <div className="skeleton h-14 w-full" />
            </div>
          )}

          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Latency</p>
                  <p className="mt-1.5 text-[22px] font-bold text-white">{result.latencyMs}ms</p>
                </div>
                <div className="card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Sources</p>
                  <p className="mt-1.5 text-[22px] font-bold text-white">{result.sources.length}</p>
                </div>
                <div className="card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Diagnostics</p>
                  <p className="mt-1.5 text-[22px] font-bold text-white">{result.diagnostics.length}</p>
                </div>
              </div>

              <section className="card overflow-hidden">
                <div className="border-b border-white/[0.07] px-5 py-3.5">
                  <h3 className="text-[13px] font-bold text-white">Sources</h3>
                </div>
                {result.sources.length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-white/35">No playable sources returned.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Quality</th>
                          <th>Codec</th>
                          <th>Provider</th>
                          <th>URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sources.map((source, index) => (
                          <tr key={`${source.rawUrl}-${index}`}>
                            <td className="font-semibold text-white/85">{source.quality}</td>
                            <td className="text-white/45">{source.codec}</td>
                            <td>
                              <span className="badge badge-indigo">{source.provider}</span>
                            </td>
                            <td>
                              <span
                                className="block max-w-[320px] truncate font-mono text-[10.5px] text-white/35"
                                title={source.rawUrl}
                              >
                                {source.rawUrl}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="card overflow-hidden">
                <div className="border-b border-white/[0.07] px-5 py-3.5">
                  <h3 className="text-[13px] font-bold text-white">Diagnostics</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.diagnostics.map((item, index) => (
                        <tr key={`${item.provider}-${index}`}>
                          <td className="font-mono text-[11px] text-white/75">{item.provider}</td>
                          <td>
                            <span className={cn('badge', item.ok ? 'badge-green' : 'badge-red')}>
                              {item.ok ? 'OK' : 'Failed'}
                            </span>
                          </td>
                          <td className="text-white/40">{item.latencyMs}ms</td>
                          <td className="max-w-[340px] text-[11px] text-white/40">
                            {item.error ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {result.subtitles.length > 0 && (
                <section className="card p-5">
                  <h3 className="mb-3 text-[13px] font-bold text-white">Subtitles</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.subtitles.map((subtitle, index) => (
                      <span key={`${subtitle.rawUrl}-${index}`} className="badge badge-gray">
                        {subtitle.label || subtitle.lang} · {subtitle.provider}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
