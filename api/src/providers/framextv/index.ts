import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { fetchJson, mediaHeaders, USER_AGENT } from '../shared.js';

const API_BASES = ['https://api.framextv.xyz', 'https://api.framextv.cc', 'https://api.framextv.tech'];

interface FramexSource {
  url?: string;
  quality?: string;
  type?: string;
  server?: string;
  skipProxy?: boolean;
  headers?: Record<string, string>;
}

interface FramexSubtitle {
  url?: string;
  label?: string;
  language?: string;
  format?: string;
  source?: string;
}

interface FramexResponse {
  success?: boolean;
  provider?: string;
  error?: string;
  sources?: FramexSource[];
  subtitles?: FramexSubtitle[];
}

function qualityLabel(quality: string | undefined): string {
  if (!quality) return 'auto';
  const match = /(2160|1440|1080|720|480|360)/.exec(quality);
  return match ? `${match[1]}p` : 'auto';
}

function streamUrl(media: MediaRef): string {
  const url = new URL('/api/stream', API_BASES[0]);
  url.searchParams.set('type', media.type);
  url.searchParams.set('id', media.tmdbId);
  if (media.type === 'tv') {
    url.searchParams.set('season', String(media.season ?? 1));
    url.searchParams.set('episode', String(media.episode ?? 1));
  }
  return url.toString();
}

export const framextvProvider: Provider = {
  id: 'framextv',
  name: 'FrameX TV',
  description: 'FrameX TV stream API (multi mirror, MP4 and HLS)',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = 'https://framextv.cc/';

    let payload: FramexResponse | undefined;
    let lastError = '';

    for (const base of API_BASES) {
      const url = new URL('/api/stream', base);
      url.searchParams.set('type', media.type);
      url.searchParams.set('id', media.tmdbId);
      if (media.type === 'tv') {
        url.searchParams.set('season', String(media.season ?? 1));
        url.searchParams.set('episode', String(media.episode ?? 1));
      }
      try {
        const response = await fetchJson<FramexResponse>(url, {
          headers: { Origin: 'https://framextv.cc' },
          referer,
          timeoutMs: 10000,
        });
        if (response?.success && (response.sources?.length ?? 0) > 0) {
          payload = response;
          break;
        }
        lastError = response?.error ?? 'no sources';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!payload) {
      return {
        sources: [],
        subtitles: [],
        diagnostics: [
          {
            provider: 'framextv',
            ok: false,
            latencyMs: Date.now() - started,
            error: lastError || 'framextv returned no source',
          },
        ],
      };
    }

    const sources: RawSource[] = [];
    for (const entry of payload.sources ?? []) {
      if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
      sources.push({
        rawUrl: entry.url,
        quality: qualityLabel(entry.quality),
        codec: entry.type === 'hls' || /\.m3u8/i.test(entry.url) ? 'hls' : 'h264',
        headers: mediaHeaders(referer, entry.headers),
        adaptive: entry.type === 'hls' || /\.m3u8/i.test(entry.url),
      });
    }

    const subtitles: RawSubtitle[] = [];
    for (const entry of payload.subtitles ?? []) {
      if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
      const label = entry.label ?? entry.language ?? 'en';
      subtitles.push({
        rawUrl: entry.url,
        lang: (entry.language ?? 'en').toLowerCase(),
        label,
        headers: mediaHeaders(referer),
      });
    }

    return {
      sources,
      subtitles,
      diagnostics: [{ provider: 'framextv', ok: sources.length > 0, latencyMs: Date.now() - started }],
    };
  },
};

export { streamUrl, USER_AGENT };
