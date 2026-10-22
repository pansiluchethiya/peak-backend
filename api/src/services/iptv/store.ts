// api/src/services/iptv/store.ts
import { getDb } from '../db.js';
import { encodeChannelId } from '../../core/peakId.js';

export interface IptvPlaylist {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  channelCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface IptvChannel {
  id: string;
  playlistId: number;
  name: string;
  tvgId: string | null;
  groupTitle: string | null;
  logo: string | null;
  url: string;
  headers: Record<string, string>;
  language: string | null;
  country: string | null;
  position: number;
  enabled: boolean;
}

export function ensureIptvTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS iptv_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      channel_count INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS iptv_channels (
      id TEXT PRIMARY KEY,
      playlist_id INTEGER NOT NULL REFERENCES iptv_playlists(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tvg_id TEXT,
      group_title TEXT,
      logo TEXT,
      url TEXT NOT NULL,
      headers TEXT,
      language TEXT,
      country TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_iptv_channels_group ON iptv_channels(group_title);
    CREATE INDEX IF NOT EXISTS idx_iptv_channels_tvg ON iptv_channels(tvg_id);
  `);
}

function rowToPlaylist(row: Record<string, unknown>): IptvPlaylist {
  return {
    id: row.id as number,
    name: row.name as string,
    url: row.url as string,
    enabled: row.enabled === 1,
    channelCount: row.channel_count as number,
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
  };
}

function rowToChannel(row: Record<string, unknown>): IptvChannel {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse((row.headers as string) ?? '{}') as Record<string, string>;
  } catch {
    headers = {};
  }
  return {
    id: row.id as string,
    playlistId: row.playlist_id as number,
    name: row.name as string,
    tvgId: (row.tvg_id as string | null) ?? null,
    groupTitle: (row.group_title as string | null) ?? null,
    logo: (row.logo as string | null) ?? null,
    url: row.url as string,
    headers,
    language: (row.language as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    position: row.position as number,
    enabled: row.enabled === 1,
  };
}

export function listPlaylists(): IptvPlaylist[] {
  ensureIptvTables();
  const rows = getDb().prepare('SELECT * FROM iptv_playlists ORDER BY id').all() as Record<string, unknown>[];
  return rows.map(rowToPlaylist);
}

export function getPlaylist(id: number): IptvPlaylist | null {
  ensureIptvTables();
  const row = getDb().prepare('SELECT * FROM iptv_playlists WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToPlaylist(row) : null;
}

export function addPlaylist(name: string, url: string): IptvPlaylist {
  ensureIptvTables();
  const db = getDb();
  const res = db.prepare('INSERT INTO iptv_playlists (name, url) VALUES (?, ?)').run(name, url);
  return getPlaylist(Number(res.lastInsertRowid)) as IptvPlaylist;
}

export function removePlaylist(id: number): boolean {
  ensureIptvTables();
  const res = getDb().prepare('DELETE FROM iptv_playlists WHERE id = ?').run(id);
  return res.changes > 0;
}

export function setPlaylistEnabled(id: number, enabled: boolean): void {
  ensureIptvTables();
  getDb().prepare('UPDATE iptv_playlists SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function updatePlaylistSync(id: number, channelCount: number, error: string | null): void {
  ensureIptvTables();
  getDb()
    .prepare('UPDATE iptv_playlists SET channel_count = ?, last_sync_at = ?, last_error = ? WHERE id = ?')
    .run(channelCount, new Date().toISOString(), error, id);
}

export function replaceChannels(playlistId: number, channels: Array<Omit<IptvChannel, 'id' | 'playlistId' | 'enabled'> & { enabled?: boolean }>): void {
  ensureIptvTables();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM iptv_channels WHERE playlist_id = ?').run(playlistId);
    const stmt = db.prepare(
      `INSERT INTO iptv_channels (id, playlist_id, name, tvg_id, group_title, logo, url, headers, language, country, position, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    channels.forEach((ch, index) => {
      const id = encodeChannelId(ch.name, ch.url);
      stmt.run(
        id,
        playlistId,
        ch.name,
        ch.tvgId ?? null,
        ch.groupTitle ?? null,
        ch.logo ?? null,
        ch.url,
        JSON.stringify(ch.headers ?? {}),
        ch.language ?? null,
        ch.country ?? null,
        ch.position ?? index,
        ch.enabled === false ? 0 : 1,
        new Date().toISOString(),
      );
    });
  });
  tx();
}

export function listChannels(filter: { q?: string; group?: string; limit?: number } = {}): IptvChannel[] {
  ensureIptvTables();
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    conditions.push('LOWER(name) LIKE ?');
    params.push(`%${filter.q.toLowerCase()}%`);
  }
  if (filter.group) {
    conditions.push('group_title = ?');
    params.push(filter.group);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  const rows = db
    .prepare(`SELECT * FROM iptv_channels ${where} ORDER BY position, name LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[];
  return rows.map(rowToChannel);
}

export function getChannel(id: string): IptvChannel | null {
  ensureIptvTables();
  const row = getDb().prepare('SELECT * FROM iptv_channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToChannel(row) : null;
}

export function setChannelEnabled(id: string, enabled: boolean): void {
  ensureIptvTables();
  getDb().prepare('UPDATE iptv_channels SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function listGroups(): Array<{ id: string; title: string; count: number }> {
  ensureIptvTables();
  const rows = getDb()
    .prepare('SELECT group_title, COUNT(*) AS c FROM iptv_channels GROUP BY group_title ORDER BY group_title')
    .all() as Array<{ group_title: string | null; c: number }>;
  return rows.map((row) => ({
    id: row.group_title ?? 'ungrouped',
    title: row.group_title ?? 'Ungrouped',
    count: row.c,
  }));
}
