import type { MediaRef, Provider, ProviderResult, RawSource } from '../types.js';
import { fetchJson, fetchText, mediaHeaders, USER_AGENT } from '../shared.js';

const BASE = 'https://www.rivestream.app';
const API = `${BASE}/api/backendfetch`;
const SECRET_KEY = 'NDQzM2UwYzI=';
const FALLBACK_SERVICES = [
  'primevids',
  'vanguard',
  'citadel',
  'mirage',
  'apogee',
  'velocity',
  'ignite',
  'tampa',
  'meridian',
  'savannah',
  'prometheus',
  'quasar',
  'solstice',
  'apollo',
  'asiacloud',
];

interface RivestreamSource {
  quality?: string;
  url?: string;
  source?: string;
  format?: string;
  headers?: Record<string, string>;
}

interface RivestreamResponse {
  data?: {
    sources?: RivestreamSource[];
  } | null;
}

function requestUrl(params: Record<string, string>): string {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function qualityLabel(quality: string | undefined): string {
  if (!quality) return 'auto';
  const match = /(2160|1440|1080|720|480|360)/.exec(quality);
  return match ? `${match[1]}p` : 'auto';
}

function toSource(entry: RivestreamSource | undefined): RawSource | undefined {
  if (!entry || typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) return undefined;
  return {
    rawUrl: entry.url,
    quality: qualityLabel(entry.quality),
    codec: entry.format === 'hls' || /\.m3u8/i.test(entry.url) ? 'hls' : 'h264',
    headers: mediaHeaders(`${BASE}/`, entry.headers),
    adaptive: true,
  };
}

async function serviceList(): Promise<string[]> {
  try {
    const response = await fetchJson<{ data?: string[] }>(
      requestUrl({ requestID: 'VideoProviderServices', secretKey: 'rive', proxyMode: 'undefined' }),
      { timeoutMs: 6000 },
    );
    if (Array.isArray(response.data) && response.data.length > 0) return response.data;
  } catch {
    // fall through to the static list
  }
  return FALLBACK_SERVICES;
}

export const rivestreamProvider: Provider = {
  id: 'rivestream',
  name: 'Rivestream',
  description: 'Rivestream multi-server provider API',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const embedUrl =
      media.type === 'tv'
        ? `${BASE}/embed?type=tv&id=${encodeURIComponent(media.tmdbId)}&season=${media.season ?? 1}&episode=${media.episode ?? 1}`
        : `${BASE}/embed?type=movie&id=${encodeURIComponent(media.tmdbId)}`;

    try {
      if (media.type === 'tv') {
        throw new Error('rivestream tv provider API requires a per-request signature');
      }

      const services = await serviceList();
      const sources: RawSource[] = [];
      const seen = new Set<string>();

      for (const service of services) {
        let response: RivestreamResponse;
        try {
          response = await fetchJson<RivestreamResponse>(
            requestUrl({
              requestID: 'movieVideoProvider',
              id: media.tmdbId,
              service,
              secretKey: SECRET_KEY,
              proxyMode: 'undefined',
            }),
            { timeoutMs: 6000 },
          );
        } catch {
          continue;
        }
        const entries = response.data?.sources ?? [];
        for (const entry of entries) {
          const source = toSource(entry);
          if (!source || seen.has(source.rawUrl)) continue;
          seen.add(source.rawUrl);
          sources.push(source);
        }
        if (sources.length > 0) break;
      }

      if (sources.length === 0) throw new Error('rivestream returned no playable source');

      return {
        sources,
        subtitles: [],
        diagnostics: [{ provider: 'rivestream', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let fallbackUrl = embedUrl;
      try {
        const html = await fetchText(embedUrl, { timeoutMs: 6000 });
        const match = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/i.exec(html);
        if (match) fallbackUrl = match[0];
      } catch {
        // keep the embed url
      }
      return {
        sources: [
          {
            rawUrl: fallbackUrl,
            quality: 'auto',
            codec: /\.m3u8/i.test(fallbackUrl) ? 'hls' : 'html5',
            headers: mediaHeaders(`${BASE}/`),
            adaptive: /\.m3u8/i.test(fallbackUrl),
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'rivestream',
            ok: false,
            latencyMs: Date.now() - started,
            error: message,
          },
        ],
      };
    }
  },
};

export { USER_AGENT };
