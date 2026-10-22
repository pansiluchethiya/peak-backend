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
import { applyProviderOrder, loadProviderOrder } from './providers/order.js';
import { watchRoutes } from './routes/watch.js';
import { metaRoutes } from './routes/meta.js';
import { liveRoutes } from './routes/live.js';
import { previewAppRoutes } from './routes/previewapp.js';
import { previewRoutes } from './routes/preview.js';
import { providersRoutes } from './routes/providers.js';
import type { Provider } from './providers/types.js';
import { assertProductionConfig } from './config.js';
import { registerRequestContext } from './middleware/requestContext.js';
import { registerErrorHandler } from './middleware/errorHandler.js';
import { isLocalAddress } from './services/geo.js';

export interface ServerOptions {
  providers?: Provider[];
  manager?: ProviderManager;
  timeoutMs?: number;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const ordered = applyProviderOrder(options.providers ?? defaultProviders(), loadProviderOrder());
  const manager =
    options.manager ?? new ProviderManager(ordered, { timeoutMs: options.timeoutMs });
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: (address: string) => isLocalAddress(address),
  });

  registerRequestContext(app);
  registerErrorHandler(app);

  app.register(cors, { origin: true, credentials: true });
  app.register(healthRoutes);
  app.register(brandingRoutes);
  app.register(searchRoutes);
  app.register(recommendationsRoutes);
  app.register(watchRoutes, { manager });
  app.register(metaRoutes);
  app.register(liveRoutes);
  app.register(streamRoutes, { manager });
  app.register(previewRoutes);
  app.register(previewAppRoutes);
  app.register(proxyRoutes);
  app.register(providersRoutes, { manager });
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
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // Bootstrap IPTV playlists from env (optional).
    const urls = (process.env.IPTV_PLAYLIST_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (urls.length > 0) {
      import('./services/iptv/store.js').then(({ addPlaylist }) => {
        for (const url of urls) {
          try { addPlaylist(url, url); } catch { /* duplicate url */ }
        }
      }).then(() => import('./services/iptv/sync.js')).then(({ syncAllPlaylists }) => syncAllPlaylists()).catch(() => undefined);
    }
    // Periodic sync.
    const intervalMin = Number.parseInt(process.env.IPTV_SYNC_INTERVAL_MINUTES ?? '360', 10);
    if (Number.isFinite(intervalMin) && intervalMin > 0) {
      setInterval(() => {
        import('./services/iptv/sync.js').then(({ syncAllPlaylists }) => syncAllPlaylists()).catch(() => undefined);
      }, intervalMin * 60 * 1000);
    }
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
