import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ProviderManager } from '../providers/index.js';
import type { MediaRef, MediaType } from '../providers/types.js';
import { tmdbTitle } from '../services/tmdb.js';
import { encodeProxyData } from '../services/proxyToken.js';
import { getCache } from '../services/cache.js';
import { listProviderStates } from '../services/db.js';
import { trackStream, type FingerprintQuery } from '../middleware/tracker.js';
import type { AggregatedResult } from '../providers/types.js';

interface StreamParams {
  tmdbId: string;
}

interface TvParams extends StreamParams {
  season: string;
  episode: string;
}

interface StreamQuery extends FingerprintQuery {
  invalidate?: string;
}

const inFlight = new Map<string, Promise<AggregatedResult>>();

function cacheKey(media: MediaRef): string {
  const disabled = listProviderStates()
    .filter((provider) => !provider.enabled)
    .map((provider) => provider.id)
    .sort()
    .join(',');
  return `stream:${media.type}:${media.tmdbId}:${media.season ?? 0}:${media.episode ?? 0}:${disabled}`;
}

async function aggregate(
  manager: ProviderManager,
  media: MediaRef,
  key: string,
): Promise<AggregatedResult> {
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = manager
    .getSources(media)
    .then(async (result) => {
      await getCache().set(key, result, 3600);
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function proxyUrl(rawUrl: string, headers?: Record<string, string>): string {
  return `/api/v1/proxy?data=${encodeURIComponent(encodeProxyData({ url: rawUrl, headers }))}`;
}

async function handleStream(
  manager: ProviderManager,
  request: FastifyRequest,
  media: MediaRef,
  fingerprint: StreamQuery,
): Promise<unknown> {
  const started = Date.now();
  const cache = getCache();
  const key = cacheKey(media);
  let cacheHit = false;

  if (fingerprint.invalidate === '1') await cache.del(key);

  let aggregated = await cache.get<AggregatedResult>(key);
  if (aggregated) {
    cacheHit = true;
  } else {
    aggregated = await aggregate(manager, media, key);
  }

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
    meta: { cacheHit, latencyMs: Date.now() - started },
    diagnostics: aggregated.diagnostics,
  };
}

export async function streamRoutes(
  app: FastifyInstance,
  options: { manager: ProviderManager },
): Promise<void> {
  app.get<{ Params: StreamParams; Querystring: StreamQuery }>(
    '/api/v1/stream/movie/:tmdbId',
    async (request) => {
      const media: MediaRef = { tmdbId: request.params.tmdbId, type: 'movie' };
      return handleStream(options.manager, request, media, request.query);
    },
  );

  app.get<{ Params: TvParams; Querystring: StreamQuery }>(
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
