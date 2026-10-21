import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vidsrcProvider } from '../src/providers/vidsrc/index.js';
import { resetDbForTests } from '../src/services/db.js';

const http = vi.hoisted(() => ({
  readText: vi.fn(),
  readJson: vi.fn(),
  readBuffer: vi.fn(),
}));

vi.mock('../src/services/safeHttp.js', () => ({
  readText: http.readText,
  readJson: http.readJson,
  readBuffer: http.readBuffer,
}));

function page(sourceUrl: string, extra = ''): string {
  return `<html><body><script>var player={file:"${sourceUrl}",type:"hls"};</script>${extra}</body></html>`;
}

function textResponse(text: string, url: string, status = 200) {
  return { text, status, headers: {}, url: new URL(url) };
}

function jsonResponse<T>(data: T, url: string, status = 200) {
  return { data, status, url: new URL(url) };
}

function chainForVidsrcSh(requested: string[]) {
  http.readText.mockImplementation(async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    if (url === 'https://vidsrc.sh/embed/movie/27205') {
      return textResponse('<div data-api="/vs_src.php?type=movie&amp;id=27205"></div>', url);
    }
    if (url === 'https://nested.test/embed/movie/27205?vs=abc') {
      return textResponse(
        '<script>window.CFG = {"playerUrl":"/embed/player/movie/27205?vs=abc"};</script>',
        url,
      );
    }
    if (url === 'https://nested.test/embed/player/movie/27205?vs=abc') {
      return textResponse(
        '<script>window.CONFIG = {"api":"https://data.test/api.php?type=movie&tmdb=27205&stream_urls","apiToken":"single-use"};</script>',
        url,
      );
    }
    if (url === 'https://stream.test/generate.php') return textResponse('play-token', url);
    if (url === 'https://stream.test/master.m3u8?token=play-token') {
      return textResponse(
        [
          '#EXTM3U',
          '#EXT-X-STREAM-INF:BANDWIDTH=2384282,CODECS="mp4a.40.2,avc1.64001f",RESOLUTION=1280x534',
          '/pl/abc/720/index.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=4406071,CODECS="mp4a.40.2,avc1.640028",RESOLUTION=1920x800',
          '/pl/abc/1080/index.m3u8',
        ].join('\n'),
        url,
      );
    }
    throw new Error(`unexpected text request ${url}`);
  });

  http.readJson.mockImplementation(async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.startsWith('https://vidsrc.sh/vs_src.php')) {
      return jsonResponse({ src: 'https://nested.test/embed/movie/27205?vs=abc' }, url);
    }
    if (url.includes('data.test/api.php')) {
      expect(url).toContain('api_token=single-use');
      return jsonResponse({ data: { stream_urls: ['https://stream.test/master.m3u8'] } }, url);
    }
    throw new Error(`unexpected json request ${url}`);
  });
}

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDbForTests();
  http.readText.mockReset();
  http.readJson.mockReset();
  http.readBuffer.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vidsrc provider', () => {
  it('aggregates all working domains, dedupes, and reports per-domain diagnostics', async () => {
    const requested: string[] = [];
    http.readText.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('vidsrc.sh')) {
        return textResponse(page('https://cdn.example/1080p/a.m3u8'), url);
      }
      if (url.includes('vidsrc2.ru')) throw new Error('connect ETIMEDOUT');
      if (url.includes('vidsrc.ir')) {
        return textResponse(
          page(
            'https://cdn.example/b.m3u8',
            '<track src="https://cdn.example/sub.vtt" srclang="en" label="English">',
          ),
          url,
        );
      }
      if (url.includes('vidsrc.io')) return textResponse('<html>no source here</html>', url);
      if (url.includes('vidsrc.tw')) return textResponse('forbidden', url, 403);
      return textResponse('error', url, 500);
    });
    http.readJson.mockRejectedValue(new Error('no nested api'));

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
    chainForVidsrcSh(requested);
    // Non-vidsrc.sh domains are unavailable in this scenario.
    const original = http.readText.getMockImplementation()!;
    http.readText.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (!url.includes('vidsrc.sh') && !url.includes('nested.test') && !url.includes('stream.test')) {
        throw new Error('domain down');
      }
      return original(input);
    });

    const result = await vidsrcProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toEqual([
      expect.objectContaining({
        rawUrl: 'https://stream.test/master.m3u8?token=play-token',
        quality: 'auto',
        adaptive: true,
      }),
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

  it('rejects a 200 HTML page where the master playlist should be', async () => {
    http.readText.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://vidsrc.sh/embed/movie/27205') {
        return textResponse('<div data-api="/vs_src.php?type=movie&amp;id=27205"></div>', url);
      }
      if (url === 'https://nested.test/embed/movie/27205?vs=abc') {
        return textResponse('<script>window.CFG = {"playerUrl":"/player"};</script>', url);
      }
      if (url === 'https://nested.test/player') {
        return textResponse(
          '<script>window.CONFIG = {"api":"https://data.test/api.php","apiToken":"x"};</script>',
          url,
        );
      }
      if (url === 'https://stream.test/generate.php') return textResponse('play-token', url);
      if (url.startsWith('https://stream.test/master.m3u8')) {
        return textResponse('<html><body>challenge required</body></html>', url);
      }
      throw new Error('domain down');
    });
    http.readJson.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://vidsrc.sh/vs_src.php')) {
        return jsonResponse({ src: 'https://nested.test/embed/movie/27205?vs=abc' }, url);
      }
      if (url.startsWith('https://data.test/api.php')) {
        return jsonResponse({ data: { stream_urls: ['https://stream.test/master.m3u8'] } }, url);
      }
      throw new Error('unexpected json');
    });

    const result = await vidsrcProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toEqual([]);
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.sh')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/master playlist was invalid/i),
    });
  });

  it('reports encrypted sources without a decryptor instead of treating them as playable', async () => {
    http.readText.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://vidsrc.sh/embed/movie/27205') {
        return textResponse('<div data-api="/vs_src.php?type=movie&amp;id=27205"></div>', url);
      }
      if (url === 'https://nested.test/embed/movie/27205?vs=abc') {
        return textResponse('<script>window.CFG = {"playerUrl":"/player"};</script>', url);
      }
      if (url === 'https://nested.test/player') {
        return textResponse(
          '<script>window.CONFIG = {"api":"https://data.test/api.php","apiToken":"x"};</script>',
          url,
        );
      }
      throw new Error('domain down');
    });
    http.readJson.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://vidsrc.sh/vs_src.php')) {
        return jsonResponse({ src: 'https://nested.test/embed/movie/27205?vs=abc' }, url);
      }
      if (url.startsWith('https://data.test/api.php')) {
        return jsonResponse({ data: { stream_urls: 'ENCRYPTED' } }, url);
      }
      throw new Error('unexpected json');
    });

    const result = await vidsrcProvider.getSources({ tmdbId: '27205', type: 'movie' });

    expect(result.sources).toEqual([]);
    expect(result.diagnostics?.find((d) => d.provider === 'vidsrc:vidsrc.sh')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/decryptor/i),
    });
  });

  it('builds the tv embed URL with season and episode', async () => {
    const requested: string[] = [];
    http.readText.mockImplementation(async (input: string | URL) => {
      requested.push(String(input));
      return textResponse('<html></html>', String(input));
    });
    http.readJson.mockRejectedValue(new Error('no nested api'));

    await vidsrcProvider.getSources({ tmdbId: '1396', type: 'tv', season: 1, episode: 2 });

    expect(requested).toContain('https://vidsrc.sh/embed/tv/1396/1/2');
  });
});
