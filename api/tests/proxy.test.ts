import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { encodeProxyData, decodeProxyData } from '../src/services/proxyToken.js';

let app: Awaited<ReturnType<typeof buildServer>>;
const previousSecret = process.env.PROXY_SECRET;
const previousRedis = process.env.REDIS_HOST;

beforeEach(() => {
  process.env.PROXY_SECRET = 'proxy-test-secret';
  delete process.env.REDIS_HOST;
  app = buildServer({ providers: [] });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  if (previousSecret === undefined) delete process.env.PROXY_SECRET;
  else process.env.PROXY_SECRET = previousSecret;
  if (previousRedis !== undefined) process.env.REDIS_HOST = previousRedis;
});

function proxyToken(payload: Parameters<typeof encodeProxyData>[0]): string {
  return `/api/v1/proxy?data=${encodeURIComponent(encodeProxyData(payload))}`;
}

describe('proxy route', () => {
  it('rewrites m3u8 URIs and injects upstream headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        [
          '#EXTM3U',
          '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
          '#EXTINF:6.0,',
          'seg1.ts',
          'https://other.example/seg2.ts',
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({
        url: 'https://cdn.example/path/master.m3u8',
        headers: { Referer: 'https://ref.example/', Origin: 'https://ref.example' },
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example/path/master.m3u8',
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: 'https://ref.example/' }),
      }),
    );

    const body = res.body;
    expect(body).toContain('#EXTM3U');
    expect(body).not.toContain('\nseg1.ts');

    const relativeLine = body.split('\n').find((line) => line.startsWith('/api/v1/proxy?data='));
    expect(relativeLine).toBeDefined();
    const relative = decodeProxyData(
      new URL(relativeLine!, 'http://local').searchParams.get('data')!,
    );
    expect(relative.url).toBe('https://cdn.example/path/seg1.ts');

    const keyUri = /URI="([^"]+)"/.exec(body)?.[1];
    expect(keyUri).toBeDefined();
    const key = decodeProxyData(new URL(keyUri!, 'http://local').searchParams.get('data')!);
    expect(key.url).toBe('https://cdn.example/path/key.bin');

    const rewritten = body
      .split('\n')
      .filter((line) => line.startsWith('/api/v1/proxy?data='))
      .map((line) => decodeProxyData(new URL(line, 'http://local').searchParams.get('data')!).url);
    expect(rewritten).toContain('https://other.example/seg2.ts');
  });

  it('passes binary segments through unchanged', async () => {
    const bytes = Buffer.from([0x47, 0x40, 0x00, 0x10, 0xff]);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp2t' } }),
    ));

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/seg1.ts' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp2t');
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it('rejects tampered and expired tokens', async () => {
    const valid = encodeProxyData({ url: 'https://cdn.example/a.m3u8' });
    const [body] = valid.split('.');
    const tampered = await app.inject({ method: 'GET', url: `/api/v1/proxy?data=${body}.AAAA` });
    expect(tampered.statusCode).toBe(403);

    const expired = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/a.m3u8', exp: 1 }),
    });
    expect(expired.statusCode).toBe(403);
  });

  it('blocks private-network targets', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'http://127.0.0.1:6379/' }),
    });

    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces upstream failures as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/a.m3u8' }),
    });
    expect(res.statusCode).toBe(502);
  });

  it('blocks redirects into private networks', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:6379/' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/a.m3u8' }),
    });

    expect(res.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects upstream HTML instead of reflecting it on the API origin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><script>alert(1)</script></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ));

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/segment.ts' }),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('<script>');
  });

  it('labels playlists correctly even when upstream sends a generic type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('#EXTM3U\n#EXTINF:1,\nseg.ts\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    ));

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/playlist' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
