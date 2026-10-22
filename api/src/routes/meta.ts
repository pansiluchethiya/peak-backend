// api/src/routes/meta.ts
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../core/errors.js';
import { success } from '../core/response.js';
import { decodePeakId } from '../core/peakId.js';
import { tmdbTitle } from '../services/tmdb.js';
import type { MediaType } from '../providers/types.js';

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/meta/movie', async (request, reply) => {
    const q = request.query as { id?: string };
    if (!q.id?.trim()) throw new ApiError('INVALID_REQUEST', 'id is required');
    let tmdbId = q.id.trim();
    try {
      const d = decodePeakId(q.id);
      if (d.kind !== 'movie') throw new Error('INVALID_ID');
      tmdbId = d.rawId;
    } catch {
      // allow raw
    }
    const peakId = q.id.startsWith('pm_') ? q.id : `pm_${tmdbId}`;
    try {
      const t = await tmdbTitle(tmdbId, 'movie');
      return success(request.id, {
        media: { id: peakId, type: 'movie', title: t.title, year: t.year },
      });
    } catch {
      throw new ApiError('MEDIA_NOT_FOUND', 'The requested media could not be found.');
    }
  });

  app.get('/api/v1/meta/tv', async (request, reply) => {
    const q = request.query as { id?: string };
    if (!q.id?.trim()) throw new ApiError('INVALID_REQUEST', 'id is required');
    let tmdbId = q.id.trim();
    try {
      const d = decodePeakId(q.id);
      if (d.kind !== 'tv') throw new Error('INVALID_ID');
      tmdbId = d.rawId;
    } catch {
      // allow raw
    }
    const peakId = q.id.startsWith('pm_') ? q.id : `pm_${tmdbId}`;
    try {
      const t = await tmdbTitle(tmdbId, 'tv');
      return success(request.id, {
        media: { id: peakId, type: 'tv', title: t.title, year: t.year },
      });
    } catch {
      throw new ApiError('MEDIA_NOT_FOUND', 'The requested media could not be found.');
    }
  });

  app.get('/api/v1/meta/music', async (_request, reply) => {
    throw new ApiError('NOT_IMPLEMENTED', 'Music metadata is not implemented yet.', 501);
  });
}
