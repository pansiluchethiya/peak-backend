import { Readable } from 'node:stream';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { encodeProxyData, decodeProxyData } from '../src/services/proxyToken.js';
import { safeHttp, UnsafeTargetError, type SafeResponse } from '../src/services/safeHttp.js';

let app: Awaited<ReturnType<typeof buildServer>>;
let openMock: ReturnType<typeof vi.spyOn>;
const previousSecret = process.env.PROXY_SECRET;
const previousRedis = process.env.REDIS_HOST;

function upstream(
  body: string | Buffer,
  options: {
    status?: number;
    headers?: IncomingHttpHeaders;
    url?: string;
  } = {},
): SafeResponse {
  return {
    status: options.status ?? 200,
    headers: options.headers ?? {},
    body: Readable.from([Buffer.from(body)]) as unknown as IncomingMessage,
    url: new URL(options.url ?? 'https://cdn.example/path/master.m3u8'),
  };
}

beforeEach(() => {
  process.env.PROXY_SECRET = 'proxy-test-secret';
  delete process.env.REDIS_HOST;
  app = buildServer({ providers: [] });
  openMock = vi.spyOn(safeHttp, 'openSafe');
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
  if (previousSecret === undefined) delete process.env.PROXY_SECRET;
  else process.env.PROXY_SECRET = previousSecret;
  if (previousRedis !== undefined) process.env.REDIS_HOST = previousRedis;
});

function proxyToken(payload: Parameters<typeof encodeProxyData>[0]): string {
  return `/api/v1/proxy?data=${encodeURIComponent(encodeProxyData(payload))}`;
}

describe('proxy route', () => {
  it('rewrites m3u8 URIs and injects upstream headers', async () => {
    openMock.mockResolvedValue(
      upstream(
        [
          '#EXTM3U',
          '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
          '#EXTINF:6.0,',
          'seg1.ts',
          'https://other.example/seg2.ts',
          '',
        ].join('\n'),
        { headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
      ),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({
        url: 'https://cdn.example/path/master.m3u8',
        headers: { Referer: 'https://ref.example/', Origin: 'https://ref.example' },
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(openMock).toHaveBeenCalledWith(
      new URL('https://cdn.example/path/master.m3u8'),
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
    openMock.mockResolvedValue(
      upstream(bytes, {
        headers: { 'content-type': 'video/mp2t', 'content-length': String(bytes.length) },
        url: 'https://cdn.example/seg1.ts',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/seg1.ts' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp2t');
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it('forwards range requests and 206 metadata', async () => {
    const bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    openMock.mockResolvedValue(
      upstream(bytes, {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-range': 'bytes 0-7/100',
        },
        url: 'https://cdn.example/video.mp4',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/video.mp4' }),
      headers: { range: 'bytes=0-7' },
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-7/100');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(openMock).toHaveBeenCalledWith(
      new URL('https://cdn.example/video.mp4'),
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-7' }) }),
    );
  });

  it('does not forward a stale compressed content-length', async () => {
    openMock.mockResolvedValue(
      upstream('WEBVTT\n\n00:00.000 --> 00:02.000\nhello\n', {
        headers: {
          'content-type': 'text/vtt',
          'content-encoding': 'gzip',
          'content-length': '10',
        },
        url: 'https://cdn.example/sub.vtt',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/sub.vtt' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.body).toContain('WEBVTT');
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
    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'http://127.0.0.1:6379/' }),
    });
    expect(res.statusCode).toBe(403);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('maps unsafe redirects to 403', async () => {
    openMock.mockRejectedValue(new UnsafeTargetError('target host resolves to a private address'));
    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/a.m3u8' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('surfaces upstream failures as 502', async () => {
    openMock.mockResolvedValue(
      upstream('nope', { status: 403, url: 'https://cdn.example/a.m3u8' }),
    );
    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/a.m3u8' }),
    });
    expect(res.statusCode).toBe(502);
  });

  it('rejects upstream HTML instead of reflecting it on the API origin', async () => {
    openMock.mockResolvedValue(
      upstream('<html><script>alert(1)</script></html>', {
        headers: { 'content-type': 'text/html' },
        url: 'https://cdn.example/segment.ts',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/segment.ts' }),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('<script>');
  });

  it('labels playlists correctly even when upstream sends a generic type', async () => {
    openMock.mockResolvedValue(
      upstream('#EXTM3U\n#EXTINF:1,\nseg.ts\n', {
        headers: { 'content-type': 'text/plain' },
        url: 'https://cdn.example/playlist',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/playlist' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not mistake a transport stream on a .m3u8 path for a playlist', async () => {
    const bytes = Buffer.from([0x47, 0x40, 0x00, 0x10, 0xff]);
    openMock.mockResolvedValue(
      upstream(bytes, {
        headers: { 'content-type': 'video/mp2t' },
        url: 'https://cdn.example/live/index.m3u8',
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: proxyToken({ url: 'https://cdn.example/live/index.m3u8' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp2t');
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });
});
