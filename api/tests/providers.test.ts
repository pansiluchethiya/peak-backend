import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderManager } from '../src/providers/index.js';
import type { MediaRef, Provider, ProviderResult } from '../src/providers/types.js';
import { listProviderStates, resetDbForTests, setProviderEnabled } from '../src/services/db.js';

const media: MediaRef = { tmdbId: '27205', type: 'movie', title: 'Inception' };

function makeProvider(id: string, result: ProviderResult | (() => Promise<ProviderResult>)): Provider {
  return {
    id,
    name: id.toUpperCase(),
    async getSources() {
      return typeof result === 'function' ? result() : result;
    },
  };
}

const source = (rawUrl: string) => ({ rawUrl, quality: '1080p', codec: 'h264', headers: {} });

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDbForTests();
});

describe('ProviderManager', () => {
  it('aggregates sources from enabled providers and dedupes URLs', async () => {
    const a = makeProvider('a', { sources: [source('https://cdn/a.m3u8')], subtitles: [] });
    const b = makeProvider('b', {
      sources: [source('https://cdn/a.m3u8'), source('https://cdn/b.m3u8')],
      subtitles: [{ rawUrl: 'https://cdn/b.vtt', lang: 'en', label: 'English' }],
    });

    const result = await new ProviderManager([a, b]).getSources(media);

    expect(result.sources.map((s) => s.rawUrl)).toEqual([
      'https://cdn/a.m3u8',
      'https://cdn/b.m3u8',
    ]);
    expect(result.subtitles).toHaveLength(1);
    expect(result.diagnostics.map((d) => d.provider)).toEqual(['a', 'b']);
    expect(result.diagnostics.every((d) => d.ok)).toBe(true);
  });

  it('keeps successful providers when another provider throws', async () => {
    const good = makeProvider('good', { sources: [source('https://cdn/good.m3u8')], subtitles: [] });
    const bad = makeProvider('bad', async () => {
      throw new Error('scrape failed');
    });

    const result = await new ProviderManager([good, bad]).getSources(media);

    expect(result.sources).toHaveLength(1);
    const badDiag = result.diagnostics.find((d) => d.provider === 'bad');
    expect(badDiag).toMatchObject({ ok: false, error: 'scrape failed' });
  });

  it('skips providers disabled in SQLite', async () => {
    const a = makeProvider('a', { sources: [source('https://cdn/a.m3u8')], subtitles: [] });
    const b = makeProvider('b', { sources: [source('https://cdn/b.m3u8')], subtitles: [] });
    await setProviderEnabled('b', false);

    const result = await new ProviderManager([a, b]).getSources(media);

    expect(result.sources.map((s) => s.provider)).toEqual(['a']);
    expect(result.diagnostics.map((d) => d.provider)).toEqual(['a']);
  });

  it('records a timeout diagnostic instead of hanging', async () => {
    const slow = makeProvider('slow', () => new Promise(() => undefined));
    const manager = new ProviderManager([slow], { timeoutMs: 30 });

    const result = await manager.getSources(media);

    expect(result.sources).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({ provider: 'slow', ok: false });
    expect(result.diagnostics[0].error).toMatch(/timed out/i);
  });

  it('reports provider latency', async () => {
    const a = makeProvider('a', { sources: [source('https://cdn/a.m3u8')], subtitles: [] });
    const result = await new ProviderManager([a]).getSources(media);
    expect(result.diagnostics[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('marks a provider failed when it returns no sources and reports an error', async () => {
    const empty = makeProvider('empty', {
      sources: [],
      subtitles: [],
      diagnostics: [{ provider: 'empty', ok: false, latencyMs: 5, error: 'not configured' }],
    });

    const result = await new ProviderManager([empty]).getSources(media);

    expect(result.diagnostics[0]).toMatchObject({ provider: 'empty', ok: false });
    const states = listProviderStates();
    expect(states.find((state) => state.id === 'empty')).toMatchObject({
      lastSuccess: null,
      errorCount: 1,
    });
  });

  it('marks a zero-source provider failed even without a diagnostic', async () => {
    const empty = makeProvider('empty', { sources: [], subtitles: [] });

    const result = await new ProviderManager([empty]).getSources(media);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ provider: 'empty', ok: false, error: 'no playable sources' }),
    ]);
    expect(listProviderStates().find((state) => state.id === 'empty')).toMatchObject({
      errorCount: 1,
    });
  });

  it('replaces a provider summary diagnostic instead of duplicating it', async () => {
    const healthy = makeProvider('healthy', {
      sources: [source('https://cdn/a.m3u8')],
      subtitles: [],
      diagnostics: [{ provider: 'healthy', ok: true, latencyMs: 3 }],
    });

    const result = await new ProviderManager([healthy]).getSources(media);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ provider: 'healthy', ok: true }),
    ]);
  });
});
