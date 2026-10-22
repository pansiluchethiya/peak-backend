// admin/src/app/(dashboard)/providers/order/page.tsx
// Ordering UI for stream providers. The order is persisted in
// `providersOrder.json` and applied by the API when it starts (and live when
// the order is saved from this page).

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { cn } from '@/lib/hooks';
import type { ProviderList } from '@/lib/types';

export default function ProviderOrderPage() {
  const [order, setOrder] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderResponse, providerList] = await Promise.all([
        adminFetch<{ order: string[] }>('/providers/order'),
        adminFetch<ProviderList>('/providers'),
      ]);
      const registered = providerList.providers.map((provider) => provider.id);
      setNames(
        Object.fromEntries(
          providerList.providers.map((provider) => [provider.id, provider.name]),
        ),
      );
      setOrder([
        ...orderResponse.order.filter((id) => registered.includes(id)),
        ...registered.filter((id) => !orderResponse.order.includes(id)),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function move(idx: number, direction: number) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= order.length) return;
    const newOrder = [...order];
    const [item] = newOrder.splice(idx, 1);
    newOrder.splice(newIdx, 0, item as string);
    setOrder(newOrder);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/providers/order', { method: 'PUT', body: JSON.stringify({ order }) });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-white/70">Loading order…</p>;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Provider Order</h2>
        <Link href="/providers" className="btn btn-ghost">
          Back to providers
        </Link>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-white/40">
        Providers are tried in this order. The order is stored in{' '}
        <span className="font-mono text-white/60">providersOrder.json</span> and applied by the
        API on startup.
      </p>
      {error && <p className="mb-2 text-red-400">{error}</p>}
      <ul className="space-y-2">
        {order.map((id, idx) => (
          <li key={id} className="flex items-center gap-3 rounded bg-white/[0.03] p-2">
            <span className="w-6 text-center font-mono text-[11px] text-white/30">{idx + 1}</span>
            <span className="flex-1 text-white">
              {names[id] ?? id}
              <span className="ml-2 font-mono text-[11px] text-white/30">{id}</span>
            </span>
            <button
              type="button"
              className={cn('btn btn-ghost btn-xs', idx === 0 && 'btn-disabled')}
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              aria-label={`Move ${id} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className={cn('btn btn-ghost btn-xs', idx === order.length - 1 && 'btn-disabled')}
              onClick={() => move(idx, 1)}
              disabled={idx === order.length - 1}
              aria-label={`Move ${id} down`}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Order'}
        </button>
        {saved && <span className="text-[12px] text-emerald-300">Order saved</span>}
      </div>
    </div>
  );
}
