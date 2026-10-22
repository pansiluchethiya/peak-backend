import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ProxyPayload {
  url: string;
  headers?: Record<string, string>;
  exp?: number;
  live?: boolean;
}

export class ProxyTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyTokenError';
  }
}

function secret(): string {
  return process.env.PROXY_SECRET ?? 'dev-only-secret-change-me';
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function encodeProxyData(payload: ProxyPayload): string {
  const withExpiry: ProxyPayload = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + 3600,
  };
  const body = Buffer.from(JSON.stringify(withExpiry)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeProxyData(token: string): ProxyPayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new ProxyTokenError('malformed proxy token');

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ProxyTokenError('invalid proxy signature');
  }

  let payload: ProxyPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ProxyPayload;
  } catch {
    throw new ProxyTokenError('invalid proxy payload');
  }

  if (!payload.url || typeof payload.url !== 'string') throw new ProxyTokenError('missing target url');
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ProxyTokenError('proxy token expired');
  }
  return payload;
}
