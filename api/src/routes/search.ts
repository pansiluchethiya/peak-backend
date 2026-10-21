import type { FastifyInstance } from 'fastify';
import { tmdbSearch, TmdbUnavailableError, type MediaType } from '../services/tmdb.js';

interface SearchQuery {
  q?: string;
  type?: string;
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>('/api/v1/search', async (request, reply) => {
    const { q, type = 'movie' } = request.query;
    if (!q?.trim()) return reply.code(400).send({ error: 'q is required' });
    if (type !== 'movie' && type !== 'tv') {
      return reply.code(400).send({ error: 'type must be movie or tv' });
    }

    try {
      return { results: await tmdbSearch(q.trim(), type as MediaType) };
    } catch (error) {
      if (error instanceof TmdbUnavailableError) {
        return reply.code(503).send({ error: 'TMDB_API_KEY is not configured' });
      }
      request.log.error(error);
      return reply.code(502).send({ error: 'TMDB request failed' });
    }
  });
}
