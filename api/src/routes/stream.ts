import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ProviderManager } from '../providers/index.js';
import type { MediaRef, MediaType } from '../providers/types.js';
import { tmdbTitle } from '../services/tmdb.js';
import { encodeProxyData } from '../services/proxyToken.js';
import { trackStream, type FingerprintQuery } from '../middleware/tracker.js';

interface StreamParams {
  tmdbId: string;
}

interface TvParams extends StreamParams {
  season: string;
  episode: string;
}

function proxyUrl(rawUrl: string, headers?: Record<string, string>): string {
  return `/api/v1/proxy?data=${encodeURIComponent(encodeProxyData({ url: rawUrl, headers }))}`;
}

async function handleStream(
  manager: ProviderManager,
  request: FastifyRequest,
  media: MediaRef,
  fingerprint: FingerprintQuery,
): Promise<unknown> {
  const started = Date.now();
  let title = fingerprint.title?.trim() || media.title?.trim() || `TMDB ${media.tmdbId}`;
  let year: number | null = null;

  if (process.env.TMDB_API_KEY) {
    try {
      const meta = await tmdbTitle(media.tmdbId, media.type);
      title = meta.title;
      year = meta.year;
    } catch (error) {
      request.log.warn({ error }, 'tmdb title lookup failed');
    }
  }

  const aggregated = await manager.getSources(media);
  const sources = aggregated.sources.map((source) => ({
    url: proxyUrl(source.rawUrl, source.headers),
    quality: source.quality,
    codec: source.codec,
    provider: source.provider,
    expiresIn: 3600,
  }));
  const subtitles = aggregated.subtitles.map((subtitle) => ({
    url: proxyUrl(subtitle.rawUrl, subtitle.headers),
    lang: subtitle.lang,
    label: subtitle.label,
    provider: subtitle.provider,
  }));

  await trackStream(
    request,
    {
      tmdbId: media.tmdbId,
      type: media.type,
      title,
      provider: sources[0]?.provider ?? 'none',
      quality: sources[0]?.quality ?? 'none',
    },
    fingerprint,
  );

  return {
    id: media.tmdbId,
    type: media.type,
    title,
    year,
    sources,
    subtitles,
    meta: { cacheHit: false, latencyMs: Date.now() - started },
    diagnostics: aggregated.diagnostics,
  };
}

export async function streamRoutes(
  app: FastifyInstance,
  options: { manager: ProviderManager },
): Promise<void> {
  app.get<{ Params: StreamParams; Querystring: FingerprintQuery }>(
    '/api/v1/stream/movie/:tmdbId',
    async (request) => {
      const media: MediaRef = { tmdbId: request.params.tmdbId, type: 'movie' };
      return handleStream(options.manager, request, media, request.query);
    },
  );

  app.get<{ Params: TvParams; Querystring: FingerprintQuery }>(
    '/api/v1/stream/tv/:tmdbId/:season/:episode',
    async (request) => {
      const media: MediaRef = {
        tmdbId: request.params.tmdbId,
        type: 'tv' as MediaType,
        season: Number.parseInt(request.params.season, 10) || 1,
        episode: Number.parseInt(request.params.episode, 10) || 1,
      };
      return handleStream(options.manager, request, media, request.query);
    },
  );
}
