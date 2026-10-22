// api/src/routes/live.ts
import type { FastifyInstance } from 'fastify';
import { success } from '../core/response.js';
import { listChannels, listGroups } from '../services/iptv/store.js';

export async function liveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/live/tv/channels', async (request, reply) => {
    const q = request.query as { q?: string; group?: string; limit?: string };
    const limit = q.limit ? Number.parseInt(q.limit, 10) : 200;
    const channels = listChannels({ q: q.q, group: q.group, limit }).map((ch) => ({
      id: ch.id,
      name: ch.name,
      group: ch.groupTitle,
      logo: ch.logo,
      language: ch.language,
      country: ch.country,
      enabled: ch.enabled,
    }));
    const groups = listGroups();
    return success(request.id, { groups, channels });
  });
}
