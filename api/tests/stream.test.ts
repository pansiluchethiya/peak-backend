import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import type { Provider } from '../src/providers/types.js';
import { decodeProxyData } from '../src/services/proxyToken.js';
import { getDb, resetDbForTests, setProviderEnabled } from '../src/services/db.js';
import { resetCacheForTests } from '../src/services/cache.js';

const desktopUa =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const provider: Provider = {
  id: 'fake',
  name: 'Fake',
  async getSources() {
    return {
      sources: [
        {
          rawUrl: 'https://cdn.example/x.m3u8',
          quality: '1080p',
          codec: 'h264',
          headers: { Referer: 'https://provider.example/' },
        },
      ],
      subtitles: [{ rawUrl: 'https://cdn.example/en.vtt', lang: 'en', label: 'English' }],
    };
  },
};

let app: Awaited<ReturnType<typeof buildServer>>;

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  process.env.PROXY_SECRET = 'test-secret';
  delete process.env.REDIS_HOST;
  resetDbForTests();
  resetCacheForTests();
  delete process.env.TMDB_API_KEY;
  app = buildServer({ providers: [provider] });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe('stream routes', () => {
  it('returns the envelope with rewritten proxy URLs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/stream/movie/27205?title=Inception&fpHash=fp123&ua=' + encodeURIComponent(desktopUa) + '&res=1920x1080&tz=UTC&lang=en',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: '27205',
      type: 'movie',
      title: 'Inception',
      sources: [{ quality: '1080p', codec: 'h264', provider: 'fake', expiresIn: 3600 }],
      subtitles: [{ lang: 'en', label: 'English', provider: 'fake' }],
      meta: { cacheHit: false },
    });
    expect(body.sources[0].url).toMatch(/^\/api\/v1\/proxy\?data=/);
    expect(body.subtitles[0].url).toMatch(/^\/api\/v1\/proxy\?data=/);
    expect(body.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: 'fake', ok: true })]),
    );

    const data = new URL(body.sources[0].url, 'http://local').searchParams.get('data')!;
    expect(decodeProxyData(data)).toMatchObject({
      url: 'https://cdn.example/x.m3u8',
      headers: { Referer: 'https://provider.example/' },
    });

    const row = getDb()
      .prepare('SELECT tmdb_id, media_type, title, provider, quality, device, browser, fp_hash, ip, country FROM sessions')
      .get() as Record<string, unknown>;
    expect(row).toMatchObject({
      tmdb_id: '27205',
      media_type: 'movie',
      title: 'Inception',
      provider: 'fake',
      quality: '1080p',
      device: 'desktop',
      browser: 'Chrome',
      fp_hash: 'fp123',
      ip: '127.0.0.1',
      country: 'local',
    });
  });

  it('marks the adaptive master source for the player', async () => {
    const adaptiveProvider: Provider = {
      id: 'adaptive',
      name: 'Adaptive',
      async getSources() {
        return {
          sources: [
            { rawUrl: 'https://cdn.example/master.m3u8', quality: 'auto', codec: 'auto', adaptive: true },
            { rawUrl: 'https://cdn.example/720.m3u8', quality: '720p', codec: 'h264' },
          ],
          subtitles: [],
        };
      },
    };
    const adaptiveApp = buildServer({ providers: [adaptiveProvider] });
    const res = await adaptiveApp.inject({ method: 'GET', url: '/api/v1/stream/movie/969681' });

    expect(res.statusCode).toBe(200);
    expect(res.json().sources).toEqual([
      expect.objectContaining({ quality: 'auto', adaptive: true }),
      expect.objectContaining({ quality: '720p', adaptive: false }),
    ]);
    await adaptiveApp.close();
  });

  it('builds tv requests with season and episode', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/stream/tv/1396/2/5?title=Breaking%20Bad',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: '1396', type: 'tv', title: 'Breaking Bad' });
  });

  it('still responds when every provider fails', async () => {
    const failing: Provider = {
      id: 'down',
      name: 'Down',
      async getSources() {
        throw new Error('scraper exploded');
      },
    };
    const failingApp = buildServer({ providers: [failing] });
    const res = await failingApp.inject({ method: 'GET', url: '/api/v1/stream/movie/1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().sources).toEqual([]);
    expect(res.json().diagnostics[0]).toMatchObject({ provider: 'down', ok: false, error: 'scraper exploded' });
    await failingApp.close();
  });

  it('tracks a request without a fingerprint', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/stream/movie/7' });
    expect(res.statusCode).toBe(200);
    const row = getDb().prepare('SELECT fp_hash FROM sessions').get() as { fp_hash: string | null };
    expect(row.fp_hash).toBeNull();
  });

  it('serves repeat requests from cache and supports invalidation', async () => {
    let calls = 0;
    const counting: Provider = {
      id: 'count',
      name: 'Count',
      async getSources() {
        calls += 1;
        return {
          sources: [{ rawUrl: 'https://cdn.example/count.m3u8', quality: '720p', codec: 'h264', headers: {} }],
          subtitles: [],
        };
      },
    };
    const cacheApp = buildServer({ providers: [counting] });

    const first = await cacheApp.inject({ method: 'GET', url: '/api/v1/stream/movie/999' });
    const second = await cacheApp.inject({ method: 'GET', url: '/api/v1/stream/movie/999' });

    expect(first.json().meta.cacheHit).toBe(false);
    expect(second.json().meta.cacheHit).toBe(true);
    const notInvalidated = await cacheApp.inject({ method: 'GET', url: '/api/v1/stream/movie/999?invalidate=0' });
    expect(notInvalidated.json().meta.cacheHit).toBe(true);
    const invalidated = await cacheApp.inject({ method: 'GET', url: '/api/v1/stream/movie/999?invalidate=1' });

    expect(invalidated.json().meta.cacheHit).toBe(false);
    expect(calls).toBe(2);
    await cacheApp.close();
  });

  it('coalesces concurrent cache misses into one scrape', async () => {
    let calls = 0;
    const slow: Provider = {
      id: 'slow',
      name: 'Slow',
      async getSources() {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          sources: [{ rawUrl: 'https://cdn.example/slow.m3u8', quality: '720p', codec: 'h264', headers: {} }],
          subtitles: [],
        };
      },
    };
    const cacheApp = buildServer({ providers: [slow] });

    const responses = await Promise.all(
      [1, 2, 3].map(() => cacheApp.inject({ method: 'GET', url: '/api/v1/stream/movie/4242' })),
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(calls).toBe(1);
    await cacheApp.close();
  });

  it('stops serving a provider after it is disabled', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/v1/stream/movie/31337' });
    expect(first.json().sources).toHaveLength(1);

    setProviderEnabled('fake', false);
    const second = await app.inject({ method: 'GET', url: '/api/v1/stream/movie/31337' });

    expect(second.json().sources).toEqual([]);
    expect(second.json().meta.cacheHit).toBe(false);
  });

  it('does not block playback on geolocation', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(new Response(JSON.stringify({
        status: 'success',
        country: 'United States',
        city: 'Mountain View',
      }), { status: 200 })), 250);
    })));

    const started = Date.now();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/stream/movie/88',
      remoteAddress: '8.8.8.8',
    });
    const elapsed = Date.now() - started;

    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(200);
    const initial = getDb().prepare('SELECT country FROM sessions WHERE tmdb_id = ?').get('88') as { country: string };
    expect(initial.country).toBe('unknown');

    await new Promise((resolve) => setTimeout(resolve, 350));
    const updated = getDb().prepare('SELECT country, city FROM sessions WHERE tmdb_id = ?').get('88') as {
      country: string;
      city: string;
    };
    expect(updated).toMatchObject({ country: 'United States', city: 'Mountain View' });
  });
});
