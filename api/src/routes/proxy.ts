import type { FastifyInstance } from 'fastify';
import { Buffer } from 'node:buffer';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { PassThrough, Transform } from 'node:stream';
import { decodeProxyData, encodeProxyData, ProxyTokenError, type ProxyPayload } from '../services/proxyToken.js';
import { assertSafeTarget, safeHttp, UnsafeTargetError, type SafeResponse } from '../services/safeHttp.js';

export { isBlockedAddress } from '../services/safeHttp.js';

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;
const PLAYLIST_TYPES = /mpegurl/i;
const MEDIA_TYPES =
  /^(video\/|audio\/|text\/vtt|application\/octet-stream|application\/vnd\.apple\.mpegurl|application\/x-mpegurl|application\/mpegurl)/i;

function proxyFor(target: string | URL, headers?: Record<string, string>): string {
  const token = encodeProxyData({ url: target.toString(), headers });
  return `/api/v1/proxy?data=${encodeURIComponent(token)}`;
}

function rewritePlaylist(text: string, baseUrl: string, headers?: Record<string, string>): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const resolved = new URL(uri, baseUrl).toString();
          return `URI="${proxyFor(resolved, headers)}"`;
        });
      }

      return proxyFor(new URL(trimmed, baseUrl).toString(), headers);
    })
    .join('\n');
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function looksLikeHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 64).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<?xml');
}

function mediaTypeFor(body: Buffer, declared: string): string {
  if (body.length > 0 && body[0] === 0x47) return 'video/mp2t';
  if (body.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (MEDIA_TYPES.test(declared)) return declared.split(';')[0]!.trim();
  return 'application/octet-stream';
}

function readFirstChunk(body: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (body.readableEnded) {
      resolve(Buffer.alloc(0));
      return;
    }
    let settled = false;
    const cleanup = (): void => {
      body.off('readable', onReadable);
      body.off('end', onEnd);
      body.off('error', onError);
    };
    const finish = (chunk: Buffer): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(chunk);
    };
    const onReadable = (): void => {
      const chunk = body.read();
      if (chunk !== null) finish(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    };
    const onEnd = (): void => finish(Buffer.alloc(0));
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    body.on('readable', onReadable);
    body.on('end', onEnd);
    body.on('error', onError);
  });
}

async function collectPlaylist(body: IncomingMessage, first: Buffer): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  if (first.length > 0) {
    chunks.push(first);
    total += first.length;
  }
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      body.destroy();
      throw new Error('upstream response is too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function proxyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { data?: string } }>('/api/v1/proxy', async (request, reply) => {
    if (!request.query.data) return reply.code(400).send({ error: 'data is required' });

    let payload: ProxyPayload;
    try {
      payload = decodeProxyData(request.query.data);
    } catch (error) {
      const message = error instanceof ProxyTokenError ? error.message : 'invalid proxy token';
      return reply.code(403).send({ error: message });
    }

    let target: URL;
    try {
      target = new URL(payload.url);
      assertSafeTarget(target);
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        return reply.code(403).send({ error: error.message });
      }
      return reply.code(400).send({ error: 'invalid target url' });
    }

    let upstream: SafeResponse;
    try {
      upstream = await safeHttp.openSafe(target, {
        headers: {
          ...payload.headers,
          ...(request.headers.range ? { Range: request.headers.range } : {}),
        },
        timeoutMs: 15000,
      });
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        return reply.code(403).send({ error: error.message });
      }
      return reply.code(502).send({ error: 'upstream request failed' });
    }

    if (upstream.status < 200 || upstream.status >= 300) {
      upstream.body.resume();
      return reply.code(502).send({ error: `upstream responded ${upstream.status}` });
    }

    const declaredLength = Number.parseInt(headerValue(upstream.headers, 'content-length') ?? '0', 10);
    if (declaredLength > MAX_BODY_BYTES) {
      upstream.body.destroy();
      return reply.code(413).send({ error: 'upstream response is too large' });
    }

    const contentType = headerValue(upstream.headers, 'content-type') ?? '';
    let firstChunk: Buffer;
    try {
      firstChunk = await readFirstChunk(upstream.body);
    } catch {
      return reply.code(502).send({ error: 'upstream response failed' });
    }
    const headText = firstChunk.subarray(0, 64).toString('utf8');
    const isTransportStream = firstChunk.length > 0 && firstChunk[0] === 0x47;
    const isPlaylist =
      !isTransportStream &&
      (PLAYLIST_TYPES.test(contentType) ||
        /\.m3u8$/i.test(upstream.url.pathname) ||
        headText.trimStart().startsWith('#EXTM3U'));

    if (isPlaylist) {
      let text: string;
      try {
        text = await collectPlaylist(upstream.body, firstChunk);
      } catch {
        return reply.code(413).send({ error: 'upstream response is too large' });
      }
      if (!text.trimStart().startsWith('#EXTM3U')) {
        return reply.code(502).send({ error: 'upstream playlist was invalid' });
      }
      const rewritten = rewritePlaylist(text, upstream.url.toString(), payload.headers);
      return reply
        .header('content-type', 'application/vnd.apple.mpegurl')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('access-control-allow-origin', '*')
        .header('cache-control', 'no-store')
        .send(rewritten);
    }

    if (HTML_TYPES.test(contentType) && !isTransportStream) {
      upstream.body.destroy();
      return reply.code(403).send({ error: 'upstream content type is not allowed' });
    }
    if (!MEDIA_TYPES.test(contentType) && !isTransportStream && looksLikeHtml(headText)) {
      upstream.body.destroy();
      return reply.code(403).send({ error: 'upstream content type is not allowed' });
    }

    const stream = new PassThrough();
    let total = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          callback(new Error('upstream response is too large'));
          return;
        }
        callback(null, chunk);
      },
    });
    const declared = upstream.headers['content-encoding'];
    const contentLength = headerValue(upstream.headers, 'content-length');
    const contentRange = headerValue(upstream.headers, 'content-range');
    const acceptRanges = headerValue(upstream.headers, 'accept-ranges');

    const response = reply
      .code(upstream.status)
      .header('content-type', mediaTypeFor(firstChunk, contentType))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('access-control-allow-origin', '*')
      .header('cache-control', 'public, max-age=3600');

    if (contentRange) response.header('content-range', contentRange);
    if (acceptRanges) response.header('accept-ranges', acceptRanges);
    // undici and node both decode gzip; never forward a stale compressed length.
    if (contentLength && !declared) response.header('content-length', contentLength);

    if (firstChunk.length > 0) {
      total += firstChunk.length;
      stream.write(firstChunk);
    }
    if (upstream.body.readableEnded) {
      limiter.end();
      stream.end();
    } else {
      upstream.body.pipe(limiter).pipe(stream);
    }
    limiter.on('error', () => {
      upstream.body.destroy();
      stream.destroy();
    });

    return response.send(stream);
  });
}
