'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorBanner, LoadingBlock, PageHeader } from '@/components/PageHeader';
import { adminFetch } from '@/lib/api';
import { cn, formatDate, useAdminData } from '@/lib/hooks';
import type { ProviderInfo, ProviderList } from '@/lib/types';

function statusOf(provider: ProviderInfo) {
  if (!provider.enabled) return { label: 'Disabled', tone: 'badge-gray' };
  if (provider.errorCount > 0) return { label: 'Degraded', tone: 'badge-red' };
  if (provider.lastSuccess) return { label: 'Healthy', tone: 'badge-green' };
  return { label: 'Untested', tone: 'badge-yellow' };
}

export default function ProvidersPage() {
  const { data, error, loading, reload } = useAdminData<ProviderList>('/providers');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggle(provider: ProviderInfo) {
    setBusy(provider.id);
    setActionError(null);
    try {
      await adminFetch(`/providers/${encodeURIComponent(provider.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      await reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not update provider');
    } finally {
      setBusy(null);
    }
  }

  const providers = data?.providers ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Sources"
        title="Providers"
        subtitle="Enable or disable a source instantly. Changes apply to the next stream request — no restart."
        actions={
          <Link href="/test" className="btn btn-primary">
            Open test bench
          </Link>
        }
      />

      <ErrorBanner message={error ?? actionError} />

      {loading && !data ? (
        <LoadingBlock rows={5} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Last success</th>
                  <th>Errors</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => {
                  const status = statusOf(provider);
                  return (
                    <tr key={provider.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-[11px] font-bold uppercase text-indigo-300">
                            {provider.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-white/90">{provider.name}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-white/30">{provider.id}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={cn('badge', status.tone)}>{status.label}</span>
                      </td>
                      <td className="text-white/45">{formatDate(provider.lastSuccess)}</td>
                      <td>
                        <span
                          className={cn(
                            'font-mono text-[12px]',
                            provider.errorCount > 0 ? 'text-red-300' : 'text-white/35',
                          )}
                        >
                          {provider.errorCount}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/test?provider=${encodeURIComponent(provider.id)}`}
                            className="btn btn-ghost !px-2.5 !py-1.5 text-[11px]"
                          >
                            Test
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggle(provider)}
                            disabled={busy === provider.id}
                            className={cn('btn !px-2.5 !py-1.5 text-[11px]', provider.enabled ? 'btn-danger' : 'btn-ghost')}
                          >
                            {busy === provider.id ? 'Saving…' : provider.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {providers.length === 0 && (
            <p className="py-10 text-center text-[12.5px] text-white/35">No providers registered.</p>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-white/25">
        Provider toggles are stored in SQLite and survive restarts. Error counts reset after a
        successful scrape.
      </p>
    </div>
  );
}
