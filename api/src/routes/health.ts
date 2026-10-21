import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => ({
    ok: true,
    uptime: process.uptime(),
    redis: process.env.REDIS_HOST ? 'configured' : 'unconfigured',
    db: process.env.DB_PATH ? 'configured' : 'unconfigured',
  }));
}
