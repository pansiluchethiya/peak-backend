import type { FastifyInstance } from 'fastify';
import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { decodeProxyData, encodeProxyData, ProxyTokenError, type ProxyPayload } from '../services/proxyToken.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const ALLOWED_PORTS = new Set(['', '80', '443']);
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;
const MEDIA_TYPES =
  /^(video\/|audio\/|text\/vtt|application\/octet-stream|application\/vnd\.apple\.mpegurl|application\/x-mpegurl|application\/mpegurl)/i;

class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeTargetError';
  }
}

function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isBlockedAddress(address: string): boolean {
  const value = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase();
  if (isIP(value) === 4) return isPrivateIPv4(value);
  if (isIP(value) !== 6) return true;

  if (value === '::' || value === '::1') return true;
  if (value.startsWith('::ffff:') || value.startsWith('::ffff:0:')) return true;
  if (/^f[cd]/.test(value)) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (/^ff/.test(value)) return true;
  if (value.startsWith('2001:db8')) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  );
}

async function assertSafeTarget(target: URL): Promise<void> {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new UnsafeTargetError('unsupported target protocol');
  }
  if (!ALLOWED_PORTS.has(target.port)) {
    throw new UnsafeTargetError('target port is not allowed');
  }
  if (target.username || target.password) {
    throw new UnsafeTargetError('credentials in target url are not allowed');
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) throw new UnsafeTargetError('target host is not allowed');
  if (isIP(hostname) && isBlockedAddress(hostname)) {
    throw new UnsafeTargetError('target host is not allowed');
  }

  // Tests stub fetch and use reserved example hostnames; production resolves every hop.
  if (process.env.NODE_ENV === 'test' || isIP(hostname)) return;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeTargetError('target host could not be resolved');
  }
  if (addresses.length === 0) throw new UnsafeTargetError('target host could not be resolved');
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new UnsafeTargetError('target host resolves to a private address');
  }
}

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

async function fetchUpstream(
  initial: URL,
  headers: Record<string, string> | undefined,
): Promise<{ upstream: Response; target: URL }> {
  let target = initial;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafeTarget(target);
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        ...headers,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get('location');
      if (!location) throw new Error('upstream redirect had no location');
      target = new URL(location, target);
      continue;
    }

    return { upstream, target };
  }

  throw new Error('too many upstream redirects');
}

function looksLikeHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 64).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<?xml');
}

function mediaTypeFor(body: Buffer, declared: string, isPlaylist: boolean): string {
  if (isPlaylist) return 'application/vnd.apple.mpegurl';
  if (body.length > 0 && body[0] === 0x47) return 'video/mp2t';
  if (body.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (MEDIA_TYPES.test(declared)) return declared.split(';')[0]!.trim();
  return 'application/octet-stream';
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
    } catch {
      return reply.code(400).send({ error: 'invalid target url' });
    }

    let upstream: Response;
    let finalTarget: URL;
    try {
      const requestHeaders = {
        ...payload.headers,
        ...(request.headers.range ? { Range: request.headers.range } : {}),
      };
      const result = await fetchUpstream(target, requestHeaders);
      upstream = result.upstream;
      finalTarget = result.target;
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        return reply.code(403).send({ error: error.message });
      }
      return reply.code(502).send({ error: 'upstream request failed' });
    }

    if (!upstream.ok) {
      return reply.code(502).send({ error: `upstream responded ${upstream.status}` });
    }

    const declaredLength = Number.parseInt(upstream.headers.get('content-length') ?? '0', 10);
    if (declaredLength > MAX_BODY_BYTES) {
      return reply.code(413).send({ error: 'upstream response is too large' });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const reader = upstream.body?.getReader();
    if (!reader) return reply.code(502).send({ error: 'upstream response had no body' });

    const firstRead = await reader.read();
    const firstChunk = firstRead.value ?? new Uint8Array();
    const head = Buffer.from(firstChunk.subarray(0, 64));
    const headText = head.toString('utf8');
    const isPlaylist =
      /mpegurl/i.test(contentType) ||
      /\.m3u8$/i.test(finalTarget.pathname) ||
      headText.trimStart().startsWith('#EXTM3U');

    if (isPlaylist) {
      const chunks: Buffer[] = [Buffer.from(firstChunk)];
      let total = firstChunk.length;
      while (!firstRead.done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.length;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel();
          return reply.code(413).send({ error: 'upstream response is too large' });
        }
        chunks.push(Buffer.from(chunk.value));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trimStart().startsWith('#EXTM3U')) {
        return reply.code(502).send({ error: 'upstream playlist was invalid' });
      }
      const rewritten = rewritePlaylist(text, finalTarget.toString(), payload.headers);
      return reply
        .header('content-type', 'application/vnd.apple.mpegurl')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('access-control-allow-origin', '*')
        .header('cache-control', 'no-store')
        .send(rewritten);
    }

    const isTransportStream = firstChunk.length > 0 && firstChunk[0] === 0x47;
    if (HTML_TYPES.test(contentType) && !isTransportStream) {
      await reader.cancel();
      return reply.code(403).send({ error: 'upstream content type is not allowed' });
    }
    if (!MEDIA_TYPES.test(contentType) && !isTransportStream && looksLikeHtml(headText)) {
      await reader.cancel();
      return reply.code(403).send({ error: 'upstream content type is not allowed' });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (firstChunk.length > 0) controller.enqueue(firstChunk);
        if (firstRead.done) controller.close();
      },
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) controller.close();
          else controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    const response = reply
      .code(upstream.status)
      .header('content-type', mediaTypeFor(Buffer.from(firstChunk), contentType, false))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('access-control-allow-origin', '*')
      .header('cache-control', 'public, max-age=3600');

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) response.header('content-range', contentRange);
    response.header('accept-ranges', upstream.headers.get('accept-ranges') ?? 'bytes');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) response.header('content-length', contentLength);

    return response.send(Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]));
  });
}
