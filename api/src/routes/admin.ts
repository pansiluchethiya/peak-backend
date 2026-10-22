import type { FastifyInstance } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { ProviderManager, type MediaRef } from '../providers/index.js';
import {
  adminCookie,
  adminPasswordConfigured,
  changeAdminPassword,
  clearAdminCookie,
  passwordMatches,
  requireAdmin,
  signAdminToken,
} from '../middleware/auth.js';
import { readBranding, writeBranding, type BrandingConfig } from '../services/branding.js';
import { addPlaylist, removePlaylist, setPlaylistEnabled, listPlaylists, listChannels, setChannelEnabled, listGroups, replaceChannels, updatePlaylistSync } from '../services/iptv/store.js';
import { syncPlaylist } from '../services/iptv/sync.js';
import { getCache } from '../services/cache.js';
import { fetchZliveChannels } from '../services/iptv/adapters/zlive.js';
import { resolveDliveChannel } from '../services/iptv/adapters/dlive.js';
import {
  getDb,
  listProviderStates,
  setProviderEnabled,
} from '../services/db.js';
import { loadProviderOrder, providersOrderPath, saveProviderOrder } from '../providers/order.js';

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

  app.post('/api/v1/admin/logout', async (_request, reply) => {
    reply.header('set-cookie', clearAdminCookie());
    return { ok: true };
  });

  app.post('/api/v1/admin/password', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
      return reply.code(400).send({ error: 'currentPassword and newPassword are required' });
    }
    if (body.newPassword.length < 8) {
      return reply.code(400).send({ error: 'new password must be at least 8 characters' });
    }
    if (!passwordMatches(body.currentPassword)) {
      return reply.code(401).send({ error: 'current password is incorrect' });
    }
    changeAdminPassword(body.newPassword);
    return { ok: true };
  });

  app.get('/api/v1/admin/branding', { preHandler: requireAdmin }, async () => {
    return readBranding();
  });

  app.put('/api/v1/admin/branding', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as Partial<Record<keyof BrandingConfig, unknown>>;
    const fields: Array<keyof BrandingConfig> = ['name', 'logoUrl', 'accentColor', 'tagline'];
    for (const field of fields) {
      if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
        return reply.code(400).send({ error: `${field} must be a non-empty string` });
      }
    }
    const accentColor = (body.accentColor as string).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      return reply.code(400).send({ error: 'accentColor must be a hex colour like #6366f1' });
    }
    const config: BrandingConfig = {
      name: (body.name as string).trim(),
      logoUrl: (body.logoUrl as string).trim(),
      accentColor,
      tagline: (body.tagline as string).trim(),
    };
    return writeBranding(config);
  });

  // --- IPTV playlists ---
  app.get('/api/v1/admin/iptv/playlists', { preHandler: requireAdmin }, async () => {
    return { playlists: listPlaylists() };
  });

  app.post('/api/v1/admin/iptv/playlists', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { name?: string; url?: string };
    if (!body.name?.trim() || !body.url?.trim()) {
      return reply.code(400).send({ error: 'name and url are required' });
    }
    try {
      const playlist = addPlaylist(body.name.trim(), body.url.trim());
      return { playlist };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }
  });

  app.post('/api/v1/admin/iptv/playlists/:id/sync', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' });
    const result = await syncPlaylist(id);
    return result;
  });

  app.delete('/api/v1/admin/iptv/playlists/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' });
    const ok = removePlaylist(id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.post('/api/v1/admin/iptv/playlists/:id/toggle', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    const body = (request.body ?? {}) as { enabled?: boolean };
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' });
    setPlaylistEnabled(id, body.enabled !== false);
    return { ok: true };
  });

  app.get('/api/v1/admin/iptv/channels', { preHandler: requireAdmin }, async (request) => {
    const q = request.query as { q?: string; group?: string; limit?: string };
    const limit = q.limit ? Number.parseInt(q.limit, 10) : 200;
    return { channels: listChannels({ q: q.q, group: q.group, limit }) };
  });

  app.post('/api/v1/admin/iptv/channels/:id/toggle', { preHandler: requireAdmin }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as { enabled?: boolean };
    setChannelEnabled(id, body.enabled !== false);
    return { ok: true };
  });

  app.get('/api/v1/admin/iptv/groups', { preHandler: requireAdmin }, async () => {
    return { groups: listGroups() };
  });

  app.post('/api/v1/admin/iptv/import/zlive', { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      const channels = await fetchZliveChannels();
      // Store as a single playlist named "zlive.st"
      let playlist = listPlaylists().find((p) => p.name === 'zlive.st');
      if (!playlist) playlist = addPlaylist('zlive.st', 'https://iptv.zlive.st/channels.json');
      replaceChannels(
        playlist.id,
        channels.map((ch, index) => ({
          name: ch.name,
          tvgId: ch.tvgId,
          groupTitle: ch.groupTitle,
          logo: ch.logo,
          url: ch.url,
          headers: ch.headers,
          language: ch.language,
          country: ch.country,
          position: index,
        })),
      );
      updatePlaylistSync(playlist.id, channels.length, null);
      return { ok: true, playlist, channelCount: channels.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/api/v1/admin/iptv/import/dlive', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { id?: string; name?: string };
    if (!body.id?.trim()) return reply.code(400).send({ error: 'id is required' });
    try {
      const resolved = await resolveDliveChannel(body.id.trim());
      let playlist = listPlaylists().find((p) => p.name === 'dlive.sx');
      if (!playlist) playlist = addPlaylist('dlive.sx', 'https://dlive.sx/');
      const existing = listChannels({}).filter((c) => c.playlistId === playlist!.id);
      replaceChannels(playlist.id, [
        ...existing.map((c) => ({
          name: c.name,
          tvgId: c.tvgId,
          groupTitle: c.groupTitle,
          logo: c.logo,
          url: c.url,
          headers: c.headers,
          language: c.language,
          country: c.country,
          position: c.position,
          enabled: c.enabled,
        })),
        {
          name: body.name?.trim() || resolved.name,
          tvgId: body.id.trim(),
          groupTitle: 'dlive',
          logo: null,
          url: resolved.url,
          headers: resolved.headers,
          language: null,
          country: null,
          position: existing.length,
        },
      ]);
      updatePlaylistSync(playlist.id, existing.length + 1, null);
      return { ok: true, playlist, url: resolved.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/api/v1/admin/providers', { preHandler: requireAdmin }, async () => {
    const states = new Map(listProviderStates().map((state) => [state.id, state]));
    return {
      providers: manager.list().map((provider, index) => {
        const state = states.get(provider.id);
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description ?? null,
          enabled: provider.enabled !== false && (state?.enabled ?? true),
          lastSuccess: state?.lastSuccess ?? null,
          errorCount: state?.errorCount ?? 0,
          order: index,
        };
      }),
    };
  });

  app.get('/api/v1/admin/providers/order', { preHandler: requireAdmin }, async () => {
    const order = loadProviderOrder();
    const registered = manager.list().map((provider) => provider.id);
    const merged = [
      ...order.filter((id) => registered.includes(id)),
      ...registered.filter((id) => !order.includes(id)),
    ];
    return { order: merged, file: providersOrderPath() };
  });

  app.put('/api/v1/admin/providers/order', { preHandler: requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { order?: unknown };
    if (!Array.isArray(body.order)) {
      return reply.code(400).send({ error: 'order must be an array of provider ids' });
    }
    const order = body.order.filter((value): value is string => typeof value === 'string');
    const registered = new Set(manager.list().map((provider) => provider.id));
    const unknown = order.filter((id) => !registered.has(id));
    if (unknown.length > 0) {
      return reply.code(400).send({ error: `unknown provider: ${unknown.join(', ')}` });
    }
    try {
      saveProviderOrder(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: `could not persist the provider order: ${message}` });
    }
    manager.reorder(order);
    return { ok: true, order: manager.list().map((provider) => provider.id) };
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
      provider?: unknown;
    };
    if (typeof body.tmdbId !== 'string' || !body.tmdbId.trim()) {
      return reply.code(400).send({ error: 'tmdbId is required' });
    }
    if (body.type !== 'movie' && body.type !== 'tv') {
      return reply.code(400).send({ error: 'type must be movie or tv' });
    }
    let target = manager;
    if (typeof body.provider === 'string' && body.provider) {
      const selected = manager.list().filter((provider) => provider.id === body.provider);
      if (selected.length === 0) {
        return reply.code(404).send({ error: 'unknown provider' });
      }
      target = new ProviderManager(selected);
    }
    const media: MediaRef = {
      tmdbId: body.tmdbId.trim(),
      type: body.type,
      season: typeof body.season === 'number' ? body.season : undefined,
      episode: typeof body.episode === 'number' ? body.episode : undefined,
    };
    const started = Date.now();
    const result = await target.getSources(media, { includeDisabled: true });
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
