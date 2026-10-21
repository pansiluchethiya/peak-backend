import type { FastifyInstance } from 'fastify';
import { Buffer } from 'node:buffer';
import { decodeProxyData, encodeProxyData, ProxyTokenError, type ProxyPayload } from '../services/proxyToken.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('169.254.')
  );
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
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return reply.code(403).send({ error: 'unsupported target protocol' });
    }
    if (isBlockedHost(target.hostname)) {
      return reply.code(403).send({ error: 'target host is not allowed' });
    }

    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          ...payload.headers,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return reply.code(502).send({ error: 'upstream request failed' });
    }

    if (!upstream.ok) {
      return reply.code(502).send({ error: `upstream responded ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const isPlaylist = /mpegurl/i.test(contentType) || /\.m3u8$/i.test(target.pathname);

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, target.toString(), payload.headers);
      return reply
        .header('content-type', contentType || 'application/vnd.apple.mpegurl')
        .header('access-control-allow-origin', '*')
        .header('cache-control', 'no-store')
        .send(rewritten);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return reply
      .header('content-type', contentType || 'application/octet-stream')
      .header('access-control-allow-origin', '*')
      .header('cache-control', 'public, max-age=3600')
      .send(body);
  });
}
