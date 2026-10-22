import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { readText } from '../../services/safeHttp.js';
import {
  USER_AGENT,
  dedupeSubtitles,
  directSource,
  embedSource,
  extractPlaylistSubtitles,
  parseMasterPlaylist,
} from '../shared.js';

const BASE = 'https://vixsrc.to';
const TIMEOUT_MS = 10000;

interface VixsrcApiResponse {
  src?: string;
}

interface MasterPlaylist {
  url: string;
  params: Record<string, string>;
}

/** Minimal cookie jar: vixsrc ties the embed page and the playlist together. */
class CookieJar {
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

async function fetchVixsrc(
  url: string,
  jar: CookieJar,
  referer?: string,
): Promise<{ text: string; status: number }> {
  const cookie = jar.header();
  const response = await readText(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*',
      ...(referer ? { Referer: referer } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    timeoutMs: TIMEOUT_MS,
    maxBytes: 4 * 1024 * 1024,
  });
  jar.absorb(response.headers['set-cookie']);
  return { text: response.text, status: response.status };
}

function apiUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${BASE}/api/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${BASE}/api/movie/${encodeURIComponent(media.tmdbId)}`;
}

function extractMasterPlaylist(html: string): MasterPlaylist | undefined {
  const block = /window\.masterPlaylist\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html)?.[1];
  if (!block) return undefined;
  const url = /url\s*:\s*'([^']+)'/.exec(block)?.[1];
  if (!url) return undefined;
  const params: Record<string, string> = {};
  const paramsBlock = /params\s*:\s*\{([\s\S]*?)\}/.exec(block)?.[1] ?? '';
  for (const match of paramsBlock.matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)) {
    params[match[1]!] = match[2]!;
  }
  return { url, params };
}

function playlistUrl(master: MasterPlaylist): string {
  const url = new URL(master.url);
  for (const [key, value] of Object.entries(master.params)) {
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set('h', '1');
  url.searchParams.set('lang', 'en');
  return url.toString();
}

export const vixsrcProvider: Provider = {
  id: 'vixsrc',
  name: 'VixSrc',
  description: 'VixSrc playlist API with a signed master playlist',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const jar = new CookieJar();
    const sources: RawSource[] = [];
    const subtitles: RawSubtitle[] = [];

    try {
      const api = await fetchVixsrc(apiUrl(media), jar);
      if (api.status < 200 || api.status >= 300) {
        throw new Error(`vixsrc api responded ${api.status}`);
      }
      const payload = JSON.parse(api.text) as VixsrcApiResponse;
      if (typeof payload.src !== 'string' || !payload.src) {
        throw new Error('vixsrc api returned no player');
      }

      const embedUrl = new URL(payload.src, BASE).toString();
      const embed = await fetchVixsrc(embedUrl, jar, `${BASE}/`);
      if (embed.status < 200 || embed.status >= 300) {
        throw new Error(`vixsrc embed responded ${embed.status}`);
      }

      const master = extractMasterPlaylist(embed.text);
      if (!master) {
        throw new Error('vixsrc embed page had no master playlist');
      }

      const mediaUrl = playlistUrl(master);
      const playlist = await fetchVixsrc(mediaUrl, jar, embedUrl);
      if (playlist.status < 200 || playlist.status >= 300) {
        throw new Error(`vixsrc playlist responded ${playlist.status}`);
      }
      if (!playlist.text.trimStart().startsWith('#EXTM3U')) {
        throw new Error('vixsrc playlist was invalid');
      }

      sources.push({
        rawUrl: mediaUrl,
        quality: 'auto',
        codec: 'hls',
        headers: { Referer: embedUrl, Origin: BASE, 'User-Agent': USER_AGENT },
        adaptive: true,
      });
      sources.push(...parseMasterPlaylist(playlist.text, mediaUrl, embedUrl));
      subtitles.push(...extractPlaylistSubtitles(playlist.text, mediaUrl, embedUrl));

      return {
        sources,
        subtitles: dedupeSubtitles(subtitles),
        diagnostics: [{ provider: 'vixsrc', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallback = embedSource(
        media.type === 'tv'
          ? `${BASE}/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`
          : `${BASE}/movie/${encodeURIComponent(media.tmdbId)}`,
        `${BASE}/`,
      );
      return {
        sources: [fallback],
        subtitles: [],
        diagnostics: [
          {
            provider: 'vixsrc',
            ok: false,
            latencyMs: Date.now() - started,
            error: message,
          },
        ],
      };
    }
  },
};

export { directSource };
