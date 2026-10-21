import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vidapiProvider } from '../src/providers/vidapi/index.js';
import { resetDbForTests } from '../src/services/db.js';

const previousBase = process.env.VIDAPI_BASE_URL;

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDbForTests();
  process.env.VIDAPI_BASE_URL = 'https://vidapi.test';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousBase === undefined) delete process.env.VIDAPI_BASE_URL;
  else process.env.VIDAPI_BASE_URL = previousBase;
});

describe('vidapi provider', () => {
  it('normalizes API sources and subtitles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        sources: [{ url: 'https://cdn.example/master.m3u8', quality: '720p', codec: 'h264' }],
        subtitles: [{ url: 'https://cdn.example/en.vtt', language: 'en', label: 'English' }],
      }), { status: 200 }),
    ));

    const result = await vidapiProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toEqual([
      expect.objectContaining({ rawUrl: 'https://cdn.example/master.m3u8', quality: '720p', codec: 'h264' }),
    ]);
    expect(result.subtitles).toEqual([
      expect.objectContaining({ rawUrl: 'https://cdn.example/en.vtt', lang: 'en', label: 'English' }),
    ]);
    expect(result.diagnostics?.[0]).toMatchObject({ provider: 'vidapi', ok: true });
  });

  it('reports a clear diagnostic when the endpoint is not configured', async () => {
    delete process.env.VIDAPI_BASE_URL;

    const result = await vidapiProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toHaveLength(0);
    expect(result.diagnostics?.[0]).toMatchObject({
      provider: 'vidapi',
      ok: false,
      error: expect.stringMatching(/VIDAPI_BASE_URL/),
    });
  });

  it('reports HTTP failures without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const result = await vidapiProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toHaveLength(0);
    expect(result.diagnostics?.[0]).toMatchObject({ ok: false, error: expect.stringMatching(/500/) });
  });
});
