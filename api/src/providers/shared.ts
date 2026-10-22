import type { RawSource, RawSubtitle } from './types.js';
import { readJson, readText } from '../services/safeHttp.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export interface FetchOptions {
  headers?: Record<string, string>;
  referer?: string;
  origin?: string;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
}

function requestHeaders(options: FetchOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/json,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  if (options.referer) headers.Referer = options.referer;
  if (options.origin) headers.Origin = options.origin;
  return headers;
}

/** Fetch a document as text. Throws on non-2xx responses. */
export async function fetchText(url: string | URL, options: FetchOptions = {}): Promise<string> {
  const response = await readText(url, {
    headers: requestHeaders(options),
    method: options.method,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text;
}

/** Fetch a JSON document. Throws on non-2xx responses or malformed JSON. */
export async function fetchJson<T>(url: string | URL, options: FetchOptions = {}): Promise<T> {
  const response = await readJson<T>(url, {
    headers: { Accept: 'application/json', ...requestHeaders(options) },
    method: options.method,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.data;
}

export function decodeHtml(html: string): string {
  return html
    .replace(/\\\//g, '/')
    .replace(/\\u002F/gi, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function qualityOf(url: string): string {
  const match = /(2160|1440|1080|720|480|360)p/i.exec(url);
  return match ? `${match[1]}p` : 'auto';
}

export function codecOf(url: string): string {
  if (/h\.?265|hevc|h265/i.test(url)) return 'h265';
  if (/av1/i.test(url)) return 'av1';
  if (/\.m3u8/i.test(url)) return 'hls';
  return 'h264';
}

export function mediaHeaders(referer: string, extra?: Record<string, string>): Record<string, string> {
  let origin = referer;
  try {
    origin = new URL(referer).origin;
  } catch {
    origin = referer;
  }
  return {
    Referer: referer,
    Origin: origin,
    'User-Agent': USER_AGENT,
    ...(extra ?? {}),
  };
}

/** Build a raw source for a direct media URL (m3u8/mp4). */
export function directSource(rawUrl: string, referer: string, extraHeaders?: Record<string, string>): RawSource {
  return {
    rawUrl,
    quality: qualityOf(rawUrl),
    codec: codecOf(rawUrl),
    headers: mediaHeaders(referer, extraHeaders),
    adaptive: /\.m3u8/i.test(rawUrl),
  };
}

/**
 * Build a raw source for an embed page. The player renders these inside an
 * iframe, so they are marked as `html5` instead of a direct media codec.
 */
export function embedSource(rawUrl: string, referer = rawUrl): RawSource {
  return {
    rawUrl,
    quality: 'auto',
    codec: 'html5',
    headers: mediaHeaders(referer),
    adaptive: false,
  };
}

/**
 * Minimal cookie jar. Several providers hand out a signed session that is
 * bound to the cookies of the page that was loaded first.
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(setCookie: string | string[] | undefined): void {
    const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const value of values) {
      const [pair] = value.split(';');
      if (!pair) continue;
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** Fetch a document as text and keep the cookies of the response. */
export async function fetchTextWithJar(
  url: string | URL,
  jar: CookieJar,
  options: FetchOptions = {},
): Promise<{ text: string; status: number }> {
  const cookie = jar.header();
  const response = await readText(url, {
    headers: requestHeaders({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }),
    method: options.method,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  jar.absorb(response.headers['set-cookie']);
  return { text: response.text, status: response.status };
}

/** Fetch a JSON document and keep the cookies of the response. */
export async function fetchJsonWithJar<T>(
  url: string | URL,
  jar: CookieJar,
  options: FetchOptions = {},
): Promise<{ data: T; status: number }> {
  const cookie = jar.header();
  const response = await readText(url, {
    headers: requestHeaders({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }),
    method: options.method,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  jar.absorb(response.headers['set-cookie']);
  let data: T;
  try {
    data = JSON.parse(response.text) as T;
  } catch {
    throw new Error('upstream returned invalid json');
  }
  return { data, status: response.status };
}

/** Extract absolute media URLs (m3u8/mp4) from an HTML or JSON payload. */
export function extractMediaUrls(payload: string, baseUrl: string): string[] {
  const text = decodeHtml(payload);
  const found = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi)) {
    found.add(match[0]);
  }
  for (const match of text.matchAll(/["'](\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/gi)) {
    try {
      found.add(new URL(match[1], baseUrl).toString());
    } catch {
      // ignore malformed relative urls
    }
  }

  return [...found];
}

/** Extract `<track>` subtitles from an HTML document. */
export function extractTracks(payload: string, baseUrl: string): RawSubtitle[] {
  const subtitles: RawSubtitle[] = [];
  for (const match of decodeHtml(payload).matchAll(/<track\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const lang = /\bsrclang=["']([^"']+)["']/i.exec(tag)?.[1] ?? 'en';
    const label = /\blabel=["']([^"']+)["']/i.exec(tag)?.[1] ?? lang.toUpperCase();
    let rawUrl: string;
    try {
      rawUrl = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }
    subtitles.push({ rawUrl, lang, label, headers: mediaHeaders(baseUrl) });
  }
  return subtitles;
}

/** Extract the first iframe target of an embed page (absolute or relative). */
export function extractIframe(payload: string, baseUrl: string): string | undefined {
  const text = decodeHtml(payload);
  const patterns = [
    /<iframe[^>]+data-src=["']([^"']+)["']/i,
    /<iframe[^>]+src=["']([^"']+)["']/i,
    /"data-src"\s*:\s*"([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const found = patterns.length > 0 ? pattern.exec(text)?.[1] : undefined;
    if (!found || found === 'about:blank') continue;
    try {
      return new URL(found, baseUrl).toString();
    } catch {
      // ignore malformed iframe urls
    }
  }
  return undefined;
}

/** Deduplicate subtitles by url. */
export function dedupeSubtitles(subtitles: RawSubtitle[]): RawSubtitle[] {
  const seen = new Set<string>();
  return subtitles.filter((subtitle) => {
    if (seen.has(subtitle.rawUrl)) return false;
    seen.add(subtitle.rawUrl);
    return true;
  });
}

/**
 * Parse an HLS master playlist into one raw source per variant.
 * The master playlist itself is returned as the first (adaptive) source.
 */
export function parseMasterPlaylist(
  text: string,
  masterUrl: string,
  referer: string,
  extraHeaders?: Record<string, string>,
): RawSource[] {
  const lines = text.split(/\r?\n/);
  const sources: RawSource[] = [];
  let attributes: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      attributes = line;
      continue;
    }
    if (!attributes || !line || line.startsWith('#')) continue;

    const width = Number(/RESOLUTION=(\d+)x\d+/i.exec(attributes)?.[1] ?? 0);
    const resolved = new URL(line, masterUrl).toString();
    sources.push({
      rawUrl: resolved,
      quality: qualityFromWidth(width),
      codec: codecFromAttributes(attributes),
      headers: mediaHeaders(referer, extraHeaders),
      adaptive: false,
    });
    attributes = undefined;
  }

  return sources;
}

export function qualityFromWidth(width: number): string {
  if (width >= 3840) return '2160p';
  if (width >= 2560) return '1440p';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  if (width >= 640) return '360p';
  return 'auto';
}

export function codecFromAttributes(attributes: string): string {
  if (/hvc1|hev1/i.test(attributes)) return 'h265';
  if (/av01/i.test(attributes)) return 'av1';
  return 'h264';
}

/** Extract subtitle renditions declared in an HLS master playlist. */
export function extractPlaylistSubtitles(text: string, masterUrl: string, referer: string): RawSubtitle[] {
  const subtitles: RawSubtitle[] = [];
  for (const match of text.matchAll(/^#EXT-X-MEDIA:.*TYPE=SUBTITLES.*$/gim)) {
    const line = match[0];
    const uri = /URI="([^"]+)"/i.exec(line)?.[1];
    if (!uri) continue;
    const language = /LANGUAGE="([^"]+)"/i.exec(line)?.[1] ?? 'en';
    const name = /NAME="([^"]+)"/i.exec(line)?.[1] ?? language.toUpperCase();
    let rawUrl: string;
    try {
      rawUrl = new URL(uri, masterUrl).toString();
    } catch {
      continue;
    }
    subtitles.push({ rawUrl, lang: language, label: name, headers: mediaHeaders(referer) });
  }
  return dedupeSubtitles(subtitles);
}
