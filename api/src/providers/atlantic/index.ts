import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { fetchJson, mediaHeaders, USER_AGENT } from '../shared.js';

const CDN = 'https://cdn.hls.lol';
const SUBS = 'https://natsuki.hls.lol';

interface AtlanticContent {
  found?: boolean;
  title?: string;
  url?: string;
  type?: string;
  media_type?: string;
  tmdb_id?: string;
  season?: number;
  episode?: number;
}

interface AtlanticSubtitle {
  url?: string;
  label?: string;
  language?: string;
  lang?: string;
}

function contentUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${CDN}/content/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${CDN}/content/movie/${encodeURIComponent(media.tmdbId)}`;
}

export const atlanticProvider: Provider = {
  id: 'atlantic',
  name: 'Atlantic',
  description: 'Atlantic (hls.lol) content API with signed HLS playlists',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = 'https://atlantic.st/';

    try {
      const payload = await fetchJson<AtlanticContent>(contentUrl(media), {
        referer,
        timeoutMs: 10000,
      });

      if (!payload?.found || typeof payload.url !== 'string' || !/^https?:\/\//i.test(payload.url)) {
        throw new Error('atlantic has no stream for this title');
      }

      const source: RawSource = {
        rawUrl: payload.url,
        quality: 'auto',
        codec: payload.type === 'hls' || /\.m3u8/i.test(payload.url) ? 'hls' : 'h264',
        headers: mediaHeaders(referer),
        adaptive: true,
      };

      const subtitles: RawSubtitle[] = [];
      try {
        const subs = await fetchJson<{ subs?: AtlanticSubtitle[] }>(
          `${SUBS}/${media.type}/${encodeURIComponent(media.tmdbId)}`,
          { referer, timeoutMs: 6000 },
        );
        for (const entry of subs.subs ?? []) {
          if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
          subtitles.push({
            rawUrl: entry.url,
            lang: (entry.lang ?? entry.language ?? 'en').toLowerCase(),
            label: entry.label ?? entry.language ?? 'en',
            headers: mediaHeaders(referer),
          });
        }
      } catch {
        // subtitles are optional
      }

      return {
        sources: [source],
        subtitles,
        diagnostics: [{ provider: 'atlantic', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl:
              media.type === 'tv'
                ? `${referer}watch/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`
                : `${referer}watch/movie/${encodeURIComponent(media.tmdbId)}`,
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(referer),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'atlantic',
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
