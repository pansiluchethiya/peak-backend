import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import type { Provider } from '../src/providers/types.js';
import { getDb, insertSession, resetDbForTests } from '../src/services/db.js';
import { resetCacheForTests } from '../src/services/cache.js';

const provider: Provider = {
  id: 'fake',
  name: 'Fake Provider',
  async getSources() {
    return {
      sources: [{ rawUrl: 'https://cdn.example/a.m3u8', quality: '1080p', codec: 'h264', headers: {} }],
      subtitles: [],
    };
  },
};

let app: Awaited<ReturnType<typeof buildServer>>;
let cookie: string;
const previousPassword = process.env.ADMIN_PASSWORD;

async function login(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/login',
    payload: { password: 'admin-secret' },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
  expect(raw).toMatch(/HttpOnly/);
  return raw.split(';')[0];
}

beforeEach(async () => {
  process.env.DB_PATH = ':memory:';
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.PROXY_SECRET = 'admin-test-secret';
  delete process.env.REDIS_HOST;
  resetDbForTests();
  resetCacheForTests();
  app = buildServer({ providers: [provider] });
  cookie = await login();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = previousPassword;
});

describe('admin auth', () => {
  it('rejects a wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('protects admin routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/providers' });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin providers', () => {
  it('lists providers with health state and toggles them live', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/providers',
      headers: { cookie },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().providers).toEqual([
      expect.objectContaining({ id: 'fake', name: 'Fake Provider', enabled: true }),
    ]);

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/providers/fake',
      headers: { cookie },
      payload: { enabled: false },
    });
    expect(patch.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/providers',
      headers: { cookie },
    });
    expect(after.json().providers[0].enabled).toBe(false);
  });

  it('runs a per-provider test scrape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/test',
      headers: { cookie },
      payload: { tmdbId: '27205', type: 'movie' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sources: [expect.objectContaining({ rawUrl: 'https://cdn.example/a.m3u8', provider: 'fake' })],
      diagnostics: [expect.objectContaining({ provider: 'fake', ok: true })],
    });
  });
});

describe('admin stats and sessions', () => {
  beforeEach(() => {
    insertSession({
      ts: new Date().toISOString(),
      tmdbId: '27205',
      title: 'Inception',
      mediaType: 'movie',
      provider: 'fake',
      quality: '1080p',
      ip: '8.8.8.8',
      country: 'United States',
      city: 'Mountain View',
      device: 'desktop',
      browser: 'Chrome',
      fpHash: 'fp1',
    });
    insertSession({
      ts: new Date().toISOString(),
      tmdbId: '1396',
      title: 'Breaking Bad',
      mediaType: 'tv',
      provider: 'fake',
      quality: '720p',
      ip: '1.1.1.1',
      country: 'Australia',
      city: 'Sydney',
      device: 'mobile',
      browser: 'Safari',
      fpHash: 'fp2',
    });
  });

  it('returns dashboard stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/stats', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals).toMatchObject({ today: 2, week: 2, month: 2 });
    expect(body.topTitles).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Inception', plays: 1 })]),
    );
    expect(body.activeUsers).toBe(2);
    expect(typeof body.errorRate).toBe('number');
  });

  it('filters tracked sessions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/sessions?country=Australia&device=mobile',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessions).toHaveLength(1);
    expect(res.json().sessions[0]).toMatchObject({ title: 'Breaking Bad', country: 'Australia' });
  });

  it('reports cache and db stats and supports maintenance actions', async () => {
    const cacheStats = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cache/stats',
      headers: { cookie },
    });
    expect(cacheStats.json()).toMatchObject({ backend: 'memory' });

    const cleared = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cache/clear',
      headers: { cookie },
    });
    expect(cleared.statusCode).toBe(200);

    const dbStats = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/db/stats',
      headers: { cookie },
    });
    expect(dbStats.json().sessions).toBe(2);

    const vacuum = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/db/vacuum',
      headers: { cookie },
    });
    expect(vacuum.statusCode).toBe(200);
  });
});
