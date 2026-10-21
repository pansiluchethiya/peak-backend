import type { FastifyInstance } from 'fastify';
import { tmdbRecommendations, TmdbUnavailableError, type MediaType } from '../services/tmdb.js';

interface RecommendationParams {
  tmdbId: string;
}

interface RecommendationQuery {
  type?: string;
}

export async function recommendationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: RecommendationParams; Querystring: RecommendationQuery }>(
    '/api/v1/recommendations/:tmdbId',
    async (request, reply) => {
      const type = request.query.type ?? 'movie';
      if (type !== 'movie' && type !== 'tv') {
        return reply.code(400).send({ error: 'type must be movie or tv' });
      }

      try {
        return { results: await tmdbRecommendations(request.params.tmdbId, type as MediaType) };
      } catch (error) {
        if (error instanceof TmdbUnavailableError) {
          return reply.code(503).send({ error: 'TMDB_API_KEY is not configured' });
        }
        request.log.error(error);
        return reply.code(502).send({ error: 'TMDB request failed' });
      }
    },
  );
}
