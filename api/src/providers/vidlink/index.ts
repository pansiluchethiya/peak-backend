import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { fetchJson, fetchText, mediaHeaders, USER_AGENT } from '../shared.js';

const BASE = 'https://vidlink.pro';

interface VidlinkStreamResponse {
  sourceId?: string;
  stream?: {
    qualities?: Record<
      string,
      {
        type?: string;
        url?: string;
        codecName?: string;
        headers?: Record<string, string>;
        requiresProxy?: boolean;
      }
    >;
    captions?: Array<{ id?: string; url?: string; label?: string; lang?: string }>;
  };
}

function embedUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${BASE}/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${BASE}/movie/${encodeURIComponent(media.tmdbId)}`;
}

function codecName(value: string | undefined): string {
  if (!value) return 'h264';
  const normalized = value.toLowerCase();
  if (normalized.includes('hevc') || normalized.includes('h265')) return 'h265';
  if (normalized.includes('av1')) return 'av1';
  if (normalized.includes('vp9')) return 'vp9';
  return 'h264';
}

/**
 * VidLink guards its JSON API with a browser issued token, so the direct API
 * is only used opportunistically. When it is not available the provider falls
 * back to the public embed page.
 */
export const vidlinkProvider: Provider = {
  id: 'vidlink',
  name: 'VidLink',
  description: 'VidLink player with a browser token protected JSON API',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = `${BASE}/`;
    const sources: RawSource[] = [];
    const subtitles: RawSubtitle[] = [];

    try {
      const apiUrl = `${BASE}/api/b/${media.type}/${encodeURIComponent(media.tmdbId)}?multiLang=0`;
      let payload: VidlinkStreamResponse | null = null;
      try {
        payload = await fetchJson<VidlinkStreamResponse>(apiUrl, {
          headers: { 'X-Playback-Environment': 'standard' },
          referer,
          timeoutMs: 8000,
        });
      } catch {
        payload = null;
      }

      if (payload?.stream?.qualities) {
        for (const [quality, entry] of Object.entries(payload.stream.qualities)) {
          if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
          sources.push({
            rawUrl: entry.url,
            quality: quality.endsWith('p') ? quality : `${quality}p`,
            codec: codecName(entry.codecName),
            headers: mediaHeaders(referer, entry.headers),
            adaptive: false,
          });
        }
        for (const caption of payload.stream.captions ?? []) {
          if (typeof caption.url !== 'string') continue;
          subtitles.push({
            rawUrl: caption.url,
            lang: (caption.lang ?? 'en').toLowerCase(),
            label: caption.label ?? caption.lang ?? 'en',
            headers: mediaHeaders(referer),
          });
        }
      }

      if (sources.length === 0) {
        const html = await fetchText(embedUrl(media), { referer, timeoutMs: 8000 });
        const direct = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/i.exec(html);
        if (direct?.[0]) {
          sources.push({
            rawUrl: direct[0],
            quality: 'auto',
            codec: /\.m3u8/i.test(direct[0]) ? 'hls' : 'h264',
            headers: mediaHeaders(referer),
            adaptive: /\.m3u8/i.test(direct[0]),
          });
        }
      }

      if (sources.length === 0) {
        throw new Error('vidlink api requires a browser issued token');
      }

      return {
        sources,
        subtitles,
        diagnostics: [{ provider: 'vidlink', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: embedUrl(media),
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(referer),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'vidlink',
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
