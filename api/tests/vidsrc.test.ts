import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vidsrcProvider } from '../src/providers/vidsrc/index.js';
import { resetDbForTests } from '../src/services/db.js';

function page(sourceUrl: string, extra = ''): string {
  return `<html><body><script>var player={file:"${sourceUrl}",type:"hls"};</script>${extra}</body></html>`;
}

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDbForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vidsrc provider', () => {
  it('aggregates all working domains, dedupes, and reports per-domain diagnostics', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('vidsrc.sh')) {
        return new Response(page('https://cdn.example/1080p/a.m3u8'), { status: 200 });
      }
      if (url.includes('vidsrc2.ru')) throw new Error('connect ETIMEDOUT');
      if (url.includes('vidsrc.ir')) {
        return new Response(
          page(
            'https://cdn.example/b.m3u8',
            '<track src="https://cdn.example/sub.vtt" srclang="en" label="English">',
          ),
          { status: 200 },
        );
      }
      if (url.includes('vidsrc.io')) return new Response('<html>no source here</html>', { status: 200 });
      if (url.includes('vidsrc.tw')) return new Response('forbidden', { status: 403 });
      return new Response('error', { status: 500 });
    }));

    const result = await vidsrcProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(requested).toHaveLength(6);
    expect(result.sources.map((s) => s.rawUrl)).toEqual([
      'https://cdn.example/1080p/a.m3u8',
      'https://cdn.example/b.m3u8',
    ]);
    expect(result.sources[0].quality).toBe('1080p');
    expect(result.sources[0].codec).toBe('h264');
    expect(result.sources[0].headers?.Referer).toBe('https://vidsrc.sh/');
    expect(result.subtitles).toEqual([
      expect.objectContaining({ rawUrl: 'https://cdn.example/sub.vtt', lang: 'en', label: 'English' }),
    ]);

    expect(result.diagnostics).toHaveLength(6);
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.sh')).toMatchObject({ ok: true });
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.io')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no playable source/i),
    });
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.tw')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/403/),
    });
  });

  it('follows the nested player, token, and master playlist flow', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === 'https://vidsrc.sh/embed/movie/27205') {
        return new Response('<div data-api="/vs_src.php?type=movie&amp;id=27205"></div>', { status: 200 });
      }
      if (url.startsWith('https://vidsrc.sh/vs_src.php')) {
        return Response.json({ src: 'https://nested.test/embed/movie/27205?vs=abc' });
      }
      if (url === 'https://nested.test/embed/movie/27205?vs=abc') {
        return new Response('<script>window.CFG = {"playerUrl":"/embed/player/movie/27205?vs=abc"};</script>', { status: 200 });
      }
      if (url === 'https://nested.test/embed/player/movie/27205?vs=abc') {
        return new Response(
          '<script>window.CONFIG = {"api":"https://data.test/api.php?type=movie&tmdb=27205&stream_urls","apiToken":"single-use"};</script>',
          { status: 200 },
        );
      }
      if (url.includes('data.test/api.php')) {
        expect(url).toContain('api_token=single-use');
        return Response.json({ data: { stream_urls: ['https://stream.test/master.m3u8'] } });
      }
      if (url === 'https://stream.test/generate.php') {
        return new Response('play-token', { status: 200 });
      }
      if (url === 'https://stream.test/master.m3u8?token=play-token') {
        return new Response(
          [
            '#EXTM3U',
            '#EXT-X-STREAM-INF:BANDWIDTH=2384282,CODECS="mp4a.40.2,avc1.64001f",RESOLUTION=1280x534',
            '/pl/abc/720/index.m3u8',
            '#EXT-X-STREAM-INF:BANDWIDTH=4406071,CODECS="mp4a.40.2,avc1.640028",RESOLUTION=1920x800',
            '/pl/abc/1080/index.m3u8',
          ].join('\n'),
          { status: 200 },
        );
      }
      if (url.includes('vidsrc.sh')) return new Response('ok', { status: 200 });
      return new Response('down', { status: 500 });
    }));

    const result = await vidsrcProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toEqual([
      expect.objectContaining({
        rawUrl: 'https://stream.test/pl/abc/720/index.m3u8?token=play-token',
        quality: '720p',
        codec: 'h264',
      }),
      expect.objectContaining({
        rawUrl: 'https://stream.test/pl/abc/1080/index.m3u8?token=play-token',
        quality: '1080p',
        codec: 'h264',
      }),
    ]);
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.sh')).toMatchObject({ ok: true });
    expect(
      requested.some((url) => url.includes('data.test/api.php') && url.includes('api_token=single-use')),
    ).toBe(true);
  });

  it('builds the tv embed URL with season and episode', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response('<html></html>', { status: 200 });
    }));

    await vidsrcProvider.getSources({ tmdbId: '1396', type: 'tv', season: 1, episode: 2 });

    expect(requested).toContain('https://vidsrc.sh/embed/tv/1396/1/2');
  });
});
