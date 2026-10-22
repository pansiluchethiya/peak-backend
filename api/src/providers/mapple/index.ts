import type { MediaRef, Provider, ProviderResult, RawSource } from '../types.js';
import { fetchText, mediaHeaders, USER_AGENT } from '../shared.js';

const BASE = 'https://mapple.fun';

function watchUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${BASE}/watch/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${BASE}/watch/movie/${encodeURIComponent(media.tmdbId)}`;
}

export const mappleProvider: Provider = {
  id: 'mapple',
  name: 'Mapple',
  description: 'Mapple watch page scraper',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = `${BASE}/`;

    try {
      const html = await fetchText(watchUrl(media), { referer, timeoutMs: 10000 });
      const match = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/i.exec(html);
      if (!match?.[0]) throw new Error('mapple page had no playlist');

      const source: RawSource = {
        rawUrl: match[0],
        quality: 'auto',
        codec: 'hls',
        headers: mediaHeaders(referer),
        adaptive: true,
      };

      return {
        sources: [source],
        subtitles: [],
        diagnostics: [{ provider: 'mapple', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: watchUrl(media),
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(referer),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'mapple',
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
