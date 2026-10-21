import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmdbSearch, tmdbTitle, tmdbRecommendations, TmdbUnavailableError } from '../src/services/tmdb.js';
import { buildServer } from '../src/index.js';

const previousKey = process.env.TMDB_API_KEY;

beforeEach(() => {
  delete process.env.TMDB_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = previousKey;
});

describe('tmdb', () => {
  it('raises an unavailable error when no API key is configured', async () => {
    await expect(tmdbSearch('inception', 'movie')).rejects.toBeInstanceOf(TmdbUnavailableError);
  });

  it('normalizes movie search results', async () => {
    process.env.TMDB_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        results: [{ id: 27205, title: 'Inception', release_date: '2010-07-16', poster_path: '/inc.jpg' }],
      }), { status: 200 }),
    ));

    const results = await tmdbSearch('inception-unique-1', 'movie');
    expect(results).toEqual([
      { tmdbId: '27205', type: 'movie', title: 'Inception', year: 2010, posterPath: '/inc.jpg' },
    ]);
  });

  it('normalizes tv search results', async () => {
    process.env.TMDB_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/bb.jpg' }],
      }), { status: 200 }),
    ));

    const results = await tmdbSearch('breaking-unique-1', 'tv');
    expect(results[0]).toMatchObject({ tmdbId: '1396', type: 'tv', title: 'Breaking Bad', year: 2008 });
  });

  it('returns title metadata for a movie', async () => {
    process.env.TMDB_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 27205, title: 'Inception', release_date: '2010-07-16' }), { status: 200 }),
    ));

    await expect(tmdbTitle('27205', 'movie')).resolves.toEqual({ title: 'Inception', year: 2010 });
  });

  it('maps recommendations to normalized results', async () => {
    process.env.TMDB_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        results: [{ id: 123, title: 'Interstellar', release_date: '2014-11-05', poster_path: '/i.jpg' }],
      }), { status: 200 }),
    ));

    const recs = await tmdbRecommendations('27205', 'movie');
    expect(recs[0]).toMatchObject({ tmdbId: '123', title: 'Interstellar' });
  });

  it('search route returns 503 with a clear message without a key', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=dune&type=movie' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/TMDB_API_KEY/);
    await app.close();
  });
});
