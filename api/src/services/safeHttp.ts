import { lookup as dnsLookup } from 'node:dns';
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(['', '80', '443']);

export class UnsafeTargetError extends Error {
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
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  );
}

export function assertSafeTarget(target: URL): void {
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
}

// The lookup is passed to http(s).request so the address that was validated is
// the address actually connected to. This closes the DNS-rebinding gap between
// a preflight lookup and the connection.
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      (callback as (err: Error | null) => void)(error);
      return;
    }
    if (!addresses || addresses.length === 0) {
      (callback as (err: Error | null) => void)(new UnsafeTargetError('target host could not be resolved'));
      return;
    }
    if (addresses.some((entry) => isBlockedAddress(entry.address))) {
      (callback as (err: Error | null) => void)(
        new UnsafeTargetError('target host resolves to a private address'),
      );
      return;
    }
    const first = addresses.find((entry) => entry.family === 4) ?? addresses[0]!;
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (err: null, values: typeof addresses) => void)(null, addresses);
      return;
    }
    (callback as unknown as (err: null, address: string, family: number) => void)(
      null,
      first.address,
      first.family,
    );
  });
};

export interface OpenOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string;
}

export interface SafeResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: IncomingMessage;
  url: URL;
}

function requestOnce(target: URL, options: OpenOptions): Promise<SafeResponse> {
  const isHttps = target.protocol === 'https:';
  return new Promise((resolve, reject) => {
    const request = (isHttps ? httpsRequest : httpRequest)(
      {
        protocol: target.protocol,
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: options.method ?? 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Encoding': 'identity',
          ...(options.body ? { 'Content-Length': Buffer.byteLength(options.body) } : {}),
          ...options.headers,
        },
        lookup: safeLookup,
        timeout: options.timeoutMs ?? 15000,
      },
      (response) => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response, url: target }),
    );
    request.on('timeout', () => request.destroy(new Error('upstream request timed out')));
    request.on('error', reject);
    if (options.body) {
      request.write(options.body);
      request.end();
    } else {
      request.end();
    }
  });
}

export async function openSafe(input: string | URL, options: OpenOptions = {}): Promise<SafeResponse> {
  let target = input instanceof URL ? input : new URL(input);
  const maxRedirects = MAX_REDIRECTS;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    assertSafeTarget(target);
    const response = await requestOnce(target, options);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      response.body.resume();
      if (!location) throw new Error('upstream redirect had no location');
      target = new URL(Array.isArray(location) ? location[0]! : location, target);
      continue;
    }
    return response;
  }

  throw new Error('too many upstream redirects');
}

export class SafeHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SafeHttpError';
  }
}

async function collect(
  response: SafeResponse,
  maxBytes: number,
): Promise<{ buffer: Buffer; text: string; status: number; headers: IncomingHttpHeaders; url: URL }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      response.body.destroy();
      throw new SafeHttpError('upstream response is too large');
    }
    chunks.push(buffer);
  }
  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    text: buffer.toString('utf8'),
    status: response.status,
    headers: response.headers,
    url: response.url,
  };
}

export async function readText(
  input: string | URL,
  options: OpenOptions & { maxBytes?: number } = {},
): Promise<{ text: string; status: number; headers: IncomingHttpHeaders; url: URL }> {
  const response = await openSafe(input, options);
  const result = await collect(response, options.maxBytes ?? 4 * 1024 * 1024);
  return result;
}

export async function readBuffer(
  input: string | URL,
  options: OpenOptions & { maxBytes?: number } = {},
): Promise<{ buffer: Buffer; status: number; headers: IncomingHttpHeaders; url: URL }> {
  const response = await openSafe(input, options);
  return collect(response, options.maxBytes ?? 8 * 1024 * 1024);
}

export async function readJson<T>(
  input: string | URL,
  options: OpenOptions & { maxBytes?: number } = {},
): Promise<{ data: T; status: number; url: URL }> {
  const result = await readText(input, options);
  let data: T;
  try {
    data = JSON.parse(result.text) as T;
  } catch {
    throw new SafeHttpError('upstream returned invalid json', result.status);
  }
  return { data, status: result.status, url: result.url };
}

// Indirection for tests: proxy and provider code use this object so a test can
// replace one function without stubbing the HTTP stack.
export const safeHttp = { openSafe, readText, readBuffer, readJson };
