'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminFetch } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminFetch<{ ok: boolean }>('/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      router.replace('/');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed');
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-[120px]" />
        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" />
          <div>
            <p className="text-[15px] font-bold leading-tight">PeakMovies</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300/60">
              Control room
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300/60">
            Provider intelligence
          </p>
          <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.035em] text-white">
            Every stream.
            <br />
            Every source.
            <br />
            <span className="text-indigo-300">One dashboard.</span>
          </h1>
          <p className="mt-5 text-[13.5px] leading-relaxed text-white/40">
            Watch provider health, test scrapes, and understand your audience in real time — without
            touching a terminal.
          </p>
        </div>

        <p className="relative text-[11px] text-white/25">
          Self-hosted · SQLite + Redis · No external accounts
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-[15px] font-bold leading-tight">PeakMovies</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300/60">
                Admin
              </p>
            </div>
          </div>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/60">
            Protected area
          </p>
          <h2 className="mb-2 text-[28px] font-bold tracking-[-0.025em] text-white">Sign in</h2>
          <p className="mb-7 text-[13px] text-white/40">
            Enter the admin password configured for this instance.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="password">
                Admin password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div className="rounded-[9px] border border-red-400/20 bg-red-400/[0.07] px-3 py-2.5 text-[12px] text-red-200">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading || !password}>
              {loading ? 'Signing in…' : 'Enter dashboard'}
            </button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-white/25">
            Sessions last 24 hours. The password is set with the{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-white/45">ADMIN_PASSWORD</code>{' '}
            environment variable.
          </p>
        </div>
      </section>
    </main>
  );
}
