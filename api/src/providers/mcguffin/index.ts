import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { fetchJson, mediaHeaders, USER_AGENT } from '../shared.js';

const PLAYER = 'https://player.themcguffin.me';

interface McGuffinPlayback {
  id?: string;
  name?: string;
  quality?: string;
  type?: string;
  url?: string;
}

interface McGuffinSession {
  success?: boolean;
  error?: string;
  data?: {
    sessionId?: string;
    expiresAt?: number;
    playback?: McGuffinPlayback;
    sources?: McGuffinPlayback[];
  };
}

interface McGuffinSubtitle {
  id?: string;
  language?: string;
  label?: string;
  url?: string;
  format?: string;
}

interface McGuffinSubtitles {
  success?: boolean;
  data?: McGuffinSubtitle[];
}

function embedUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${PLAYER}/embed/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${PLAYER}/embed/movie/${encodeURIComponent(media.tmdbId)}`;
}

function qualityLabel(quality: string | undefined): string {
  if (!quality) return 'auto';
  const match = /(2160|1440|1080|720|480|360)/.exec(quality);
  return match ? `${match[1]}p` : 'auto';
}

export const mcguffinProvider: Provider = {
  id: 'mcguffin',
  name: 'McGuffin',
  description: 'McGuffin embed API (session based playback with subtitles)',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = embedUrl(media);

    try {
      const session = await fetchJson<McGuffinSession>(`${PLAYER}/api/embed/session`, {
        method: 'POST',
        body: {
          mediaId: Number(media.tmdbId),
          mediaType: media.type,
          season: media.type === 'tv' ? (media.season ?? 1) : null,
          episode: media.type === 'tv' ? (media.episode ?? 1) : null,
          options: { autoplay: true, muted: true, ads: true, language: 'en', theme: 'dark' },
        },
        headers: { Origin: 'https://themcguffin.me' },
        referer,
        timeoutMs: 15000,
      });

      if (!session?.success || !session.data) {
        throw new Error(session?.error ?? 'mcguffin session failed');
      }

      const entries = session.data.sources?.length
        ? session.data.sources
        : session.data.playback
          ? [session.data.playback]
          : [];

      const sources: RawSource[] = [];
      for (const entry of entries) {
        if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
        sources.push({
          rawUrl: entry.url,
          quality: qualityLabel(entry.quality),
          codec: entry.type === 'hls' || /\.m3u8/i.test(entry.url) ? 'hls' : 'h264',
          headers: mediaHeaders(referer),
          adaptive: entry.type === 'hls' || /\.m3u8/i.test(entry.url),
        });
      }

      if (sources.length === 0) throw new Error('mcguffin session had no playback url');

      const subtitles: RawSubtitle[] = [];
      try {
        const subs = await fetchJson<McGuffinSubtitles>(
          `${PLAYER}/api/subtitles/${encodeURIComponent(media.tmdbId)}?mediaType=${media.type}`,
          { referer, timeoutMs: 8000 },
        );
        for (const entry of subs.data ?? []) {
          if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
          subtitles.push({
            rawUrl: entry.url,
            lang: (entry.language ?? 'en').toLowerCase(),
            label: entry.label ?? entry.language ?? 'en',
            headers: mediaHeaders(referer),
          });
        }
      } catch {
        // subtitles are optional
      }

      return {
        sources,
        subtitles,
        diagnostics: [{ provider: 'mcguffin', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: referer,
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders('https://themcguffin.me/'),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'mcguffin',
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
