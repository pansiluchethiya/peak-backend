import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { pathToFileURL } from 'node:url';
import { healthRoutes } from './routes/health.js';
import { brandingRoutes } from './routes/branding.js';
import { searchRoutes } from './routes/search.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { streamRoutes } from './routes/stream.js';
import { proxyRoutes } from './routes/proxy.js';
import { adminRoutes } from './routes/admin.js';
import { ProviderManager } from './providers/index.js';
import { defaultProviders } from './providers/registry.js';
import type { Provider } from './providers/types.js';
import { assertProductionConfig } from './config.js';
import { isLocalAddress } from './services/geo.js';

export interface ServerOptions {
  providers?: Provider[];
  manager?: ProviderManager;
  timeoutMs?: number;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const manager =
    options.manager ??
    new ProviderManager(options.providers ?? defaultProviders(), { timeoutMs: options.timeoutMs });
  const app = Fastify({
    logger: false,
    trustProxy: (address: string) => isLocalAddress(address),
  });

  app.register(cors, { origin: true, credentials: true });
  app.register(healthRoutes);
  app.register(brandingRoutes);
  app.register(searchRoutes);
  app.register(recommendationsRoutes);
  app.register(streamRoutes, { manager });
  app.register(proxyRoutes);
  app.register(adminRoutes, { manager });

  return app;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    assertProductionConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const app = buildServer();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  app.listen({ port, host: '0.0.0.0' }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
