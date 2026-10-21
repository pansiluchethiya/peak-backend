import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import type { ProviderManager } from '../providers/index.js';
import type { MediaRef } from '../providers/types.js';
import {
  adminCookie,
  adminPasswordConfigured,
  passwordMatches,
  requireAdmin,
  signAdminToken,
} from '../middleware/auth.js';
import {
  getDb,
  listProviderStates,
  setProviderEnabled,
} from '../services/db.js';
import { getCache } from '../services/cache.js';

interface AdminOptions {
  manager: ProviderManager;
}

interface SessionRow {
  id: number;
  ts: string;
  tmdb_id: string;
  title: string | null;
  media_type: 'movie' | 'tv';
  provider: string | null;
  quality: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  fp_hash: string | null;
}

function sessionJson(row: SessionRow) {
  return {
    id: row.id,
    timestamp: row.ts,
    tmdbId: row.tmdb_id,
    title: row.title,
    mediaType: row.media_type,
    provider: row.provider,
    quality: row.quality,
    ip: row.ip,
    country: row.country,
    city: row.city,
    device: row.device,
    browser: row.browser,
    fpHash: row.fp_hash,
  };
}

function queryString(query: unknown, key: string): string | undefined {
  const value = (query as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function adminRoutes(app: FastifyInstance, options: AdminOptions): Promise<void> {
  const { manager } = options;

  app.post('/api/v1/admin/login', async (request, reply) => {
    if (!adminPasswordConfigured()) {
      return reply.code(503).send({ error: 'ADMIN_PASSWORD is not configured' });
    }
    const body = (request.body ?? {}) as { password?: unknown };
    if (typeof body.password !== 'string' || !passwordMatches(body.password)) {
      return reply.code(401).send({ error: 'invalid password' });
    }
    reply.header('set-cookie', adminCookie(signAdminToken()));
    return { ok: true };
  });

  app.get('/api/v1/admin/providers', { preHandler: requireAdmin }, async () => {
    const states = new Map(listProviderStates().map((state) => [state.id, state]));
    return {
      providers: manager.list().map((provider) => {
        const state = states.get(provider.id);
        return {
          id: provider.id,
          name: provider.name,
          enabled: provider.enabled !== false && (state?.enabled ?? true),
          lastSuccess: state?.lastSuccess ?? null,
          errorCount: state?.errorCount ?? 0,
        };
      }),
    };
  });

  app.patch('/api/v1/admin/providers/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be a boolean' });
    }
    if (!manager.list().some((provider) => provider.id === id)) {
      return reply.code(404).send({ error: 'unknown provider' });
    }
    setProviderEnabled(id, body.enabled);
    return { ok: true, id, enabled: body.enabled };
  });

  app.post('/api/v1/admin/test', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      tmdbId?: unknown;
      type?: unknown;
      season?: unknown;
      episode?: unknown;
    };
    if (typeof body.tmdbId !== 'string' || !body.tmdbId.trim()) {
      return reply.code(400).send({ error: 'tmdbId is required' });
    }
    if (body.type !== 'movie' && body.type !== 'tv') {
      return reply.code(400).send({ error: 'type must be movie or tv' });
    }
    const media: MediaRef = {
      tmdbId: body.tmdbId.trim(),
      type: body.type,
      season: typeof body.season === 'number' ? body.season : undefined,
      episode: typeof body.episode === 'number' ? body.episode : undefined,
    };
    const started = Date.now();
    const result = await manager.getSources(media);
    return {
      ...result,
      latencyMs: Date.now() - started,
    };
  });

  app.get('/api/v1/admin/stats', { preHandler: requireAdmin }, async () => {
    const db = getDb();
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const countSince = (iso: string): number =>
      (db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE ts >= ?').get(iso) as { count: number })
        .count;

    const totals = {
      today: countSince(dayStart.toISOString()),
      week: countSince(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()),
      month: countSince(new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()),
    };

    const topTitles = db
      .prepare(
        `SELECT title, COUNT(*) AS plays FROM sessions
         WHERE title IS NOT NULL AND title <> ''
         GROUP BY title ORDER BY plays DESC, title ASC LIMIT 10`,
      )
      .all() as Array<{ title: string; plays: number }>;

    const activeUsers = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT fp_hash) AS active FROM sessions
           WHERE fp_hash IS NOT NULL AND ts >= ?`,
        )
        .get(new Date(now - 5 * 60 * 1000).toISOString()) as { active: number }
    ).active;

    const providerErrors = (
      db.prepare('SELECT COALESCE(SUM(error_count), 0) AS errors FROM providers').get() as {
        errors: number;
      }
    ).errors;
    const monthTotal = totals.month;
    const errorRate = monthTotal + providerErrors === 0 ? 0 : providerErrors / (monthTotal + providerErrors);

    return {
      totals,
      topTitles,
      activeUsers,
      errorRate,
      providerErrors,
    };
  });

  app.get('/api/v1/admin/sessions', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as Record<string, unknown>;
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    const from = queryString(query, 'from');
    if (from) {
      clauses.push('ts >= ?');
      params.push(from);
    }
    const to = queryString(query, 'to');
    if (to) {
      clauses.push('ts <= ?');
      params.push(to);
    }
    const country = queryString(query, 'country');
    if (country) {
      clauses.push('country = ?');
      params.push(country);
    }
    const device = queryString(query, 'device');
    if (device) {
      clauses.push('device = ?');
      params.push(device);
    }
    const title = queryString(query, 'title');
    if (title) {
      clauses.push('title LIKE ?');
      params.push(`%${title}%`);
    }

    const limitRaw = Number.parseInt(queryString(query, 'limit') ?? '100', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 100;

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = getDb()
      .prepare(`SELECT * FROM sessions ${where} ORDER BY ts DESC LIMIT ?`)
      .all(...params, limit) as SessionRow[];

    return { sessions: rows.map(sessionJson) };
  });

  app.get('/api/v1/admin/cache/stats', { preHandler: requireAdmin }, async () => {
    return getCache().stats();
  });

  app.post('/api/v1/admin/cache/clear', { preHandler: requireAdmin }, async () => {
    await getCache().clear();
    return { ok: true };
  });

  app.get('/api/v1/admin/db/stats', { preHandler: requireAdmin }, async () => {
    const db = getDb();
    const sessions = (db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number })
      .count;
    const path = process.env.DB_PATH ?? './data/peakmovies.db';
    let sizeBytes = 0;
    if (path !== ':memory:' && existsSync(path)) {
      sizeBytes = statSync(path).size;
    }
    return { path, sizeBytes, sessions };
  });

  app.post('/api/v1/admin/db/vacuum', { preHandler: requireAdmin }, async () => {
    getDb().exec('VACUUM');
    return { ok: true };
  });
}
