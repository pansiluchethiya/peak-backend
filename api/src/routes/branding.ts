import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FALLBACK = {
  name: 'PeakMovies',
  logoUrl: '/logo.svg',
  accentColor: '#6366f1',
  tagline: 'Stream anything',
};

export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/branding', async (_request, reply) => {
    const file = process.env.BRANDING_FILE ?? resolve(process.cwd(), '../config/branding.json');
    try {
      const raw = await readFile(file, 'utf8');
      return reply.send(JSON.parse(raw));
    } catch {
      return reply.send(FALLBACK);
    }
  });
}
