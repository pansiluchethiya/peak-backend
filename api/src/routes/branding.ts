import type { FastifyInstance } from 'fastify';
import { readBranding } from '../services/branding.js';

export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/branding', async (_request, reply) => {
    return reply.send(await readBranding());
  });
}
