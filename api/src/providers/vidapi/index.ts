import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 8000;

interface ApiSource {
  url: string;
  quality?: string;
  codec?: string;
  headers?: Record<string, string>;
}

interface ApiSubtitle {
  url: string;
  language?: string;
  label?: string;
  headers?: Record<string, string>;
}

interface ApiResponse {
  sources?: ApiSource[];
  subtitles?: ApiSubtitle[];
}

function endpoint(media: MediaRef): URL {
  const base = process.env.VIDAPI_BASE_URL;
  if (!base) throw new Error('VIDAPI_BASE_URL is not configured');
  const url = new URL(`sources${base.endsWith('/') ? '' : '/'}`, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('tmdbId', media.tmdbId);
  url.searchParams.set('type', media.type);
  if (media.type === 'tv') {
    url.searchParams.set('season', String(media.season ?? 1));
    url.searchParams.set('episode', String(media.episode ?? 1));
  }
  return url;
}

export const vidapiProvider: Provider = {
  id: 'vidapi',
  name: 'VidApi',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    try {
      const res = await fetch(endpoint(media), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as ApiResponse;
      const sources: RawSource[] = (data.sources ?? [])
        .filter((source) => typeof source.url === 'string' && source.url.length > 0)
        .map((source) => ({
          rawUrl: source.url,
          quality: source.quality ?? 'auto',
          codec: source.codec ?? 'h264',
          headers: { 'User-Agent': USER_AGENT, ...source.headers },
        }));
      const subtitles: RawSubtitle[] = (data.subtitles ?? [])
        .filter((subtitle) => typeof subtitle.url === 'string' && subtitle.url.length > 0)
        .map((subtitle) => ({
          rawUrl: subtitle.url,
          lang: subtitle.language ?? 'en',
          label: subtitle.label ?? (subtitle.language ?? 'en').toUpperCase(),
          headers: { 'User-Agent': USER_AGENT, ...subtitle.headers },
        }));

      return {
        sources,
        subtitles,
        diagnostics: [{ provider: 'vidapi', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      return {
        sources: [],
        subtitles: [],
        diagnostics: [
          {
            provider: 'vidapi',
            ok: false,
            latencyMs: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  },
};
