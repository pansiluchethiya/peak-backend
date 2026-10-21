'use client';

import { useEffect, useState } from 'react';
import { ErrorBanner, PageHeader } from '@/components/PageHeader';
import { adminFetch } from '@/lib/api';
import { formatBytes, useAdminData } from '@/lib/hooks';
import type { Branding, CacheStats, DbStats } from '@/lib/types';

function BrandingForm() {
  const branding = useAdminData<Branding>('/branding');
  const [draft, setDraft] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (branding.data) setDraft(branding.data);
  }, [branding.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await adminFetch<Branding>('/branding', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setDraft(next);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save branding');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Branding>(field: K, value: Branding[K]) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setSaved(false);
  }

  if (branding.loading || !draft) {
    return <div className="skeleton h-[360px] w-full" />;
  }

  return (
    <form onSubmit={save} className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold text-white">Player branding</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-white/35">
            Written to <code className="font-mono text-white/50">config/branding.json</code>. The player picks it up on next load.
          </p>
        </div>
        <span className="badge badge-indigo">shared config</span>
      </div>

      <ErrorBanner message={error ?? branding.error} />

      <div className="space-y-3.5">
        <div>
          <label className="label" htmlFor="brand-name">Brand name</label>
          <input id="brand-name" className="input" value={draft.name} onChange={(event) => update('name', event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="brand-tagline">Tagline</label>
          <input id="brand-tagline" className="input" value={draft.tagline} onChange={(event) => update('tagline', event.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
          <div>
            <label className="label" htmlFor="brand-logo">Logo URL</label>
            <input id="brand-logo" className="input font-mono text-[11px]" value={draft.logoUrl} onChange={(event) => update('logoUrl', event.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="brand-accent">Accent colour</label>
            <div className="flex gap-2">
              <input
                id="brand-accent"
                type="color"
                className="h-[38px] w-11 cursor-pointer rounded-[9px] border border-white/[0.09] bg-transparent p-1"
                value={draft.accentColor}
                onChange={(event) => update('accentColor', event.target.value)}
              />
              <input
                className="input font-mono text-[11px]"
                value={draft.accentColor}
                onChange={(event) => update('accentColor', event.target.value)}
                pattern="^#[0-9a-fA-F]{6}$"
                required
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.07] bg-black/20 p-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.logoUrl} alt="" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold text-white">{draft.name}</p>
            <p className="truncate text-[10.5px] text-white/35">{draft.tagline}</p>
          </div>
          <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: draft.accentColor }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-emerald-300/80">{saved ? 'Saved to config file.' : ''}</span>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setState({ error: 'New passwords do not match.' });
      return;
    }
    setSaving(true);
    setState({});
    try {
      await adminFetch('/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setState({ ok: 'Password changed. New logins use the new password.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (reason) {
      setState({ error: reason instanceof Error ? reason.message : 'Could not change password' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-[13px] font-bold text-white">Admin password</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-white/35">
        Overrides <code className="font-mono text-white/50">ADMIN_PASSWORD</code> and is stored as a scrypt hash in SQLite.
      </p>

      {state.error && (
        <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-[11.5px] text-red-200">{state.error}</p>
      )}
      {state.ok && (
        <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[11.5px] text-emerald-200">{state.ok}</p>
      )}

      <div className="mt-4 space-y-3.5">
        <div>
          <label className="label" htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" className="input" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" className="input" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" className="input" autoComplete="new-password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button>
      </div>
    </form>
  );
}

function Maintenance() {
  const cache = useAdminData<CacheStats>('/cache/stats');
  const db = useAdminData<DbStats>('/db/stats');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function clearCache() {
    if (!window.confirm('Clear every cached stream and search result?')) return;
    setBusy('cache');
    setError(null);
    try {
      await adminFetch('/cache/clear', { method: 'POST' });
      await Promise.all([cache.reload(), db.reload()]);
      setNote('Cache cleared.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not clear cache');
    } finally {
      setBusy(null);
    }
  }

  async function vacuum() {
    if (!window.confirm('Run VACUUM on the SQLite database? The admin may stall briefly.')) return;
    setBusy('db');
    setError(null);
    try {
      await adminFetch('/db/vacuum', { method: 'POST' });
      await db.reload();
      setNote('Database vacuumed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not vacuum database');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-[13px] font-bold text-white">Cache & database</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-white/35">Stream URLs expire after one hour. Search results live for a day.</p>

      <ErrorBanner message={error ?? cache.error ?? db.error} />
      {note && <p className="mt-3 text-[11px] text-emerald-300/80">{note}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/35">Cache</span>
            <span className="badge badge-gray">{cache.data?.backend ?? '—'}</span>
          </div>
          <p className="mt-2 text-[24px] font-bold text-white">{cache.data?.keys ?? 0}</p>
          <p className="mt-0.5 text-[10.5px] text-white/30">keys · {cache.data?.hits ?? 0} hits / {cache.data?.misses ?? 0} misses</p>
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={clearCache} disabled={busy !== null}>
            {busy === 'cache' ? 'Clearing…' : 'Clear cache'}
          </button>
        </div>

        <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/35">SQLite</span>
            <span className="badge badge-green">local</span>
          </div>
          <p className="mt-2 text-[24px] font-bold text-white">{formatBytes(db.data?.sizeBytes ?? 0)}</p>
          <p className="mt-0.5 text-[10.5px] text-white/30">{db.data?.sessions ?? 0} sessions · {db.data?.path ?? '—'}</p>
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={vacuum} disabled={busy !== null}>
            {busy === 'db' ? 'Vacuuming…' : 'Vacuum database'}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Configuration"
        subtitle="Branding, credentials, and storage maintenance. Changes apply without rebuilding containers."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <BrandingForm />
        <div className="space-y-5">
          <PasswordForm />
          <Maintenance />
        </div>
      </div>
    </div>
  );
}
