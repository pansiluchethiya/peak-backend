// api/src/routes/watch.ts
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../core/errors.js';
import { success } from '../core/response.js';
import { decodePeakId } from '../core/peakId.js';
import { MovieResolver } from '../resolvers/movieResolver.js';
import { TvResolver } from '../resolvers/tvResolver.js';
import { LiveTvResolver } from '../resolvers/liveTvResolver.js';
import type { ProviderManager } from '../providers/index.js';

interface WatchOptions { manager: ProviderManager }

export async function watchRoutes(app: FastifyInstance, options: WatchOptions): Promise<void> {
  const movieResolver = new MovieResolver(options.manager);
  const tvResolver = new TvResolver(options.manager);
  const liveResolver = new LiveTvResolver();

  app.get('/api/v1/watch/movies', async (request, reply) => {
    const q = request.query as { id?: string; invalidate?: string };
    if (!q.id?.trim()) throw new ApiError('INVALID_REQUEST', 'id is required');
    try {
      decodePeakId(q.id);
    } catch {
      // allow raw ids
    }
    const result = await movieResolver.resolve({ id: q.id.trim() });
    return success(request.id, { media: result.media, sources: result.sources, subtitles: result.subtitles });
  });

  app.get('/api/v1/watch/tv', async (request, reply) => {
    const q = request.query as { id?: string; season?: string; episode?: string };
    if (!q.id?.trim()) throw new ApiError('INVALID_REQUEST', 'id is required');
    const season = Number.parseInt(q.season ?? '', 10);
    const episode = Number.parseInt(q.episode ?? '', 10);
    const result = await tvResolver.resolve({ id: q.id.trim(), season, episode });
    return success(request.id, { media: result.media, sources: result.sources, subtitles: result.subtitles });
  });

  app.get('/api/v1/watch/live/tv', async (request, reply) => {
    const q = request.query as { id?: string };
    if (!q.id?.trim()) throw new ApiError('INVALID_REQUEST', 'id is required');
    const result = await liveResolver.resolve({ id: q.id.trim() });
    return success(request.id, { media: result.media, sources: result.sources });
  });
}
