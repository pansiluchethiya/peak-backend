import type { FastifyInstance } from 'fastify';
import type { ProviderManager } from '../providers/index.js';
import { isProviderEnabled } from '../services/db.js';

interface ProvidersOptions {
  manager: ProviderManager;
}

/**
 * Public provider catalogue. The player uses it to know which providers are
 * enabled and in which order they should be tried.
 */
export async function providersRoutes(
  app: FastifyInstance,
  options: ProvidersOptions,
): Promise<void> {
  const { manager } = options;

  app.get('/api/v1/providers', async () => {
    const providers = manager.list().map((provider, index) => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled !== false && isProviderEnabled(provider.id),
      order: index,
    }));
    return { providers };
  });
}
