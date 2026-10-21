import type { FastifyInstance } from 'fastify';
import { getCache } from '../services/cache.js';
import { getDb } from '../services/db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async (_request, reply) => {
    let database = 'ok';
    try {
      getDb().prepare('SELECT 1 AS ok').get();
    } catch {
      database = 'error';
    }

    let redis = 'unconfigured';
    if (process.env.REDIS_HOST) {
      redis = (await getCache().ping()) ? 'ok' : 'degraded';
    }

    const ok = database === 'ok';
    return reply.code(ok ? 200 : 503).send({
      ok,
      uptime: process.uptime(),
      redis,
      db: database,
    });
  });
}
