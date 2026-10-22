import type {
  MediaRef,
  Provider,
  ProviderDiagnostic,
  ProviderResult,
  RawSource,
  RawSubtitle,
} from '../types.js';
import { readBuffer, readJson, readText } from '../../services/safeHttp.js';

const DOMAINS = [
  'vidsrc.sh',
  'vidsrc2.ru',
  'vidsrc.ir',
  'vidsrc.io',
  'vidsrc.tw',
  'vsembed.ru',
] as const;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DOMAIN_TIMEOUT_MS = 8000;

interface DomainOutcome {
  sources: RawSource[];
  subtitles: RawSubtitle[];
  diagnostic: ProviderDiagnostic;
}

interface ResolvedSources {
  sources: RawSource[];
  subtitles: RawSubtitle[];
}

function embedUrl(domain: string, media: MediaRef): string {
  if (media.type === 'tv') {
    return `https://${domain}/embed/tv/${media.tmdbId}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `https://${domain}/embed/movie/${media.tmdbId}`;
}

function decodeHtml(html: string): string {
  return html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

function qualityOf(url: string): string {
  const match = /(2160|1440|1080|720|480|360)p/i.exec(url);
  return match ? `${match[1]}p` : 'auto';
}

function qualityFromWidth(width: number): string {
  if (width >= 3840) return '2160p';
  if (width >= 2560) return '1440p';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  if (width >= 640) return '360p';
  return 'auto';
}

function codecOf(url: string): string {
  if (/h\.?265|hevc/i.test(url)) return 'h265';
  if (/av1/i.test(url)) return 'av1';
  return 'h264';
}

function codecFromAttributes(attributes: string): string {
  if (/hvc1|hev1/i.test(attributes)) return 'h265';
  if (/av01/i.test(attributes)) return 'av1';
  return 'h264';
}

function extractSources(html: string, domain: string): RawSource[] {
  const text = decodeHtml(html);
  const found = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi)) {
    found.add(match[0]);
  }
  for (const match of text.matchAll(/["'](\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/gi)) {
    found.add(new URL(match[1], `https://${domain}`).toString());
  }

  return [...found].map((rawUrl) => ({
    rawUrl,
    quality: qualityOf(rawUrl),
    codec: codecOf(rawUrl),
    headers: {
      Referer: `https://${domain}/`,
      Origin: `https://${domain}`,
      'User-Agent': USER_AGENT,
    },
  }));
}

function extractSubtitles(html: string, baseUrl: string): RawSubtitle[] {
  const subtitles: RawSubtitle[] = [];
  for (const match of decodeHtml(html).matchAll(/<track\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const lang = /\bsrclang=["']([^"']+)["']/i.exec(tag)?.[1] ?? 'en';
    const label = /\blabel=["']([^"']+)["']/i.exec(tag)?.[1] ?? lang.toUpperCase();
    subtitles.push({
      rawUrl: new URL(src, baseUrl).toString(),
      lang,
      label,
      headers: { Referer: `${new URL(baseUrl).origin}/`, 'User-Agent': USER_AGENT },
    });
  }
  return subtitles;
}

function dedupeSubtitles(subtitles: RawSubtitle[]): RawSubtitle[] {
  const seen = new Set<string>();
  return subtitles.filter((subtitle) => {
    if (seen.has(subtitle.rawUrl)) return false;
    seen.add(subtitle.rawUrl);
    return true;
  });
}

async function fetchText(url: string, referer?: string): Promise<string> {
  const response = await readText(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json',
      ...(referer ? { Referer: referer } : {}),
    },
    timeoutMs: DOMAIN_TIMEOUT_MS,
    maxBytes: 4 * 1024 * 1024,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text;
}

function extractWindowJson(html: string, name: string): Record<string, unknown> | undefined {
  const match = new RegExp(`${name}\\s*=\\s*(\\{[^<]*?\\})\\s*;`, 's').exec(html);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function withPlayToken(url: string, token: string): string {
  if (!token) return url;
  if (url.includes('__TOKEN__')) return url.split('__TOKEN__').join(token);
  if (/[?&]token=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

function parseMasterPlaylist(
  text: string,
  masterUrl: string,
  headers: Record<string, string>,
  token: string,
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
    const resolved = withPlayToken(new URL(line, masterUrl).toString(), token);
    sources.push({
      rawUrl: resolved,
      quality: qualityFromWidth(width),
      codec: codecFromAttributes(attributes),
      headers,
    });
    attributes = undefined;
  }

  return sources;
}

interface DecryptorExports {
  memory: WebAssembly.Memory;
  alloc(length: number): number;
  decrypt(pointer: number, length: number): number;
}

async function decryptStreamUrls(
  encrypted: string,
  vs: { wasm_url?: unknown; wasm?: unknown },
): Promise<string[]> {
  let bytes: BufferSource;
  if (typeof vs.wasm_url === 'string') {
    const response = await readBuffer(vs.wasm_url, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: DOMAIN_TIMEOUT_MS,
      maxBytes: 2 * 1024 * 1024,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`decryptor HTTP ${response.status}`);
    }
    if (response.buffer.subarray(0, 4).toString('binary') !== '\0asm') {
      throw new Error('decryptor was not a wasm module');
    }
    bytes = response.buffer as unknown as BufferSource;
  } else if (typeof vs.wasm === 'string') {
    bytes = Buffer.from(vs.wasm, 'base64') as unknown as BufferSource;
  } else {
    throw new Error('encrypted sources without a decryptor');
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports as unknown as DecryptorExports;
  const encoded = Buffer.from(encrypted, 'base64');
  const pointer = exports.alloc(encoded.length);
  new Uint8Array(exports.memory.buffer, pointer, encoded.length).set(encoded);
  const outputLength = exports.decrypt(pointer, encoded.length);
  const output = new Uint8Array(exports.memory.buffer, pointer + 12, outputLength);
  return new TextDecoder().decode(output).split('\n').filter(Boolean);
}

async function resolveNestedSources(embedHtml: string, embed: string): Promise<ResolvedSources> {
  const apiPath = /data-api=["']([^"']+)["']/i.exec(embedHtml)?.[1];
  if (!apiPath) return { sources: [], subtitles: [] };

  const sourceResponse = await readJson<{ src?: unknown }>(new URL(decodeHtml(apiPath), embed), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: embed },
    timeoutMs: DOMAIN_TIMEOUT_MS,
  });
  if (sourceResponse.status < 200 || sourceResponse.status >= 300) {
    throw new Error(`source API HTTP ${sourceResponse.status}`);
  }
  const sourceJson = sourceResponse.data;
  if (typeof sourceJson.src !== 'string') throw new Error('source API returned no nested player');

  const nestedUrl = new URL(sourceJson.src, embed).toString();
  const nestedHtml = await fetchText(nestedUrl, embed);
  const cfG = extractWindowJson(nestedHtml, 'window.CFG');
  const playerPath = typeof cfG?.playerUrl === 'string' ? cfG.playerUrl : nestedUrl;
  const playerUrl = new URL(playerPath, nestedUrl).toString();
  const playerHtml = playerUrl === nestedUrl ? nestedHtml : await fetchText(playerUrl, nestedUrl);

  const config = extractWindowJson(playerHtml, 'window.CONFIG') ?? extractWindowJson(nestedHtml, 'window.CONFIG');
  if (!config || typeof config.api !== 'string') throw new Error('player config has no stream API');

  const api = new URL(config.api, playerUrl);
  if (typeof config.apiToken === 'string' && config.apiToken) {
    api.searchParams.set('api_token', config.apiToken);
  }
  const streamResponse = await readJson<{
    data?: { stream_urls?: unknown };
    vs?: { wasm_url?: unknown; wasm?: unknown };
  }>(api, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: `${new URL(nestedUrl).origin}/`,
    },
    timeoutMs: DOMAIN_TIMEOUT_MS,
    maxBytes: 4 * 1024 * 1024,
  });
  if (streamResponse.status < 200 || streamResponse.status >= 300) {
    throw new Error(`stream API HTTP ${streamResponse.status}`);
  }
  const payload = streamResponse.data;
  const encoded = payload.data?.stream_urls;
  const streamUrls = Array.isArray(encoded)
    ? encoded.filter((value): value is string => typeof value === 'string')
    : typeof encoded === 'string'
      ? await decryptStreamUrls(encoded, payload.vs ?? {})
      : [];

  if (streamUrls.length === 0) throw new Error('stream API returned no sources');

  const origin = new URL(nestedUrl).origin;
  const headers = {
    Referer: `${origin}/`,
    Origin: origin,
    'User-Agent': USER_AGENT,
  };
  const subtitles = dedupeSubtitles([
    ...extractSubtitles(nestedHtml, nestedUrl),
    ...extractSubtitles(playerHtml, playerUrl),
  ]);

  const tokens = new Map<string, string>();
  let lastError: unknown;
  for (const candidate of streamUrls.slice(0, 3)) {
    try {
      const streamOrigin = new URL(candidate).origin;
      let token = tokens.get(streamOrigin);
      if (token === undefined) {
        token = (await fetchText(`${streamOrigin}/generate.php`)).trim();
        tokens.set(streamOrigin, token);
      }

      const masterUrl = withPlayToken(candidate, token);
      const master = await fetchText(masterUrl, `${origin}/`);
      if (!master.trimStart().startsWith('#EXTM3U')) {
        throw new Error('master playlist was invalid');
      }
      const variants = parseMasterPlaylist(master, masterUrl, headers, token);
      if (variants.length > 0) {
        return {
          sources: [
            { rawUrl: masterUrl, quality: 'auto', codec: 'auto', headers, adaptive: true },
            ...variants,
          ],
          subtitles,
        };
      }
      return {
        sources: [{ rawUrl: masterUrl, quality: 'auto', codec: 'auto', headers, adaptive: true }],
        subtitles,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('no playable source found');
}

async function scrapeDomain(domain: string, media: MediaRef): Promise<DomainOutcome> {
  const started = Date.now();
  const embed = embedUrl(domain, media);
  try {
    const html = await fetchText(embed, `https://${domain}/`);
    let resolved: ResolvedSources = { sources: [], subtitles: [] };
    let pipelineError: unknown;

    try {
      resolved = await resolveNestedSources(html, embed);
    } catch (error) {
      pipelineError = error;
    }

    const sources = resolved.sources.length > 0 ? resolved.sources : extractSources(html, domain);
    if (sources.length === 0) {
      throw pipelineError instanceof Error ? pipelineError : new Error('no playable source found');
    }

    return {
      sources,
      subtitles: dedupeSubtitles([...resolved.subtitles, ...extractSubtitles(html, embed)]),
      diagnostic: { provider: `vidsrc:${domain}`, ok: true, latencyMs: Date.now() - started },
    };
  } catch (error) {
    return {
      sources: [],
      subtitles: [],
      diagnostic: {
        provider: `vidsrc:${domain}`,
        ok: false,
        latencyMs: Date.now() - started,
        error:
          error instanceof Error
            ? error.message || error.name || 'provider request failed'
            : String(error),
      },
    };
  }
}

export const vidsrcProvider: Provider = {
  id: 'vidsrc',
  name: 'VidSrc',
  description: 'Multi-domain HLS scraper (six mirrors)',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const outcomes = await Promise.all(DOMAINS.map((domain) => scrapeDomain(domain, media)));
    return {
      sources: outcomes.flatMap((outcome) => outcome.sources),
      subtitles: outcomes.flatMap((outcome) => outcome.subtitles),
      diagnostics: outcomes.map((outcome) => outcome.diagnostic),
    };
  },
};
