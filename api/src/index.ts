import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { pathToFileURL } from 'node:url';
import { healthRoutes } from './routes/health.js';
import { brandingRoutes } from './routes/branding.js';
import { searchRoutes } from './routes/search.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });

  app.register(cors, { origin: true });
  app.register(healthRoutes);
  app.register(brandingRoutes);
  app.register(searchRoutes);

  return app;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const app = buildServer();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  app.listen({ port, host: '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
