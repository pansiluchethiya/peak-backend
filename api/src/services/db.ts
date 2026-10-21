import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const path = process.env.DB_PATH ?? './data/peakmovies.db';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_success TEXT,
      error_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      tmdb_id TEXT NOT NULL,
      title TEXT,
      media_type TEXT NOT NULL,
      provider TEXT,
      quality TEXT,
      ip TEXT,
      country TEXT,
      city TEXT,
      device TEXT,
      browser TEXT,
      fp_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(ts);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function resetDbForTests(): void {
  db?.close();
  db = null;
}

export function isProviderEnabled(id: string): boolean {
  const row = getDb().prepare('SELECT enabled FROM providers WHERE id = ?').get(id) as
    | { enabled: number }
    | undefined;
  return row ? row.enabled === 1 : true;
}

export function setProviderEnabled(id: string, enabled: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO providers (id, enabled) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
    )
    .run(id, enabled ? 1 : 0);
}

export function listProviderStates(): Array<{
  id: string;
  enabled: boolean;
  lastSuccess: string | null;
  errorCount: number;
}> {
  const rows = getDb()
    .prepare('SELECT id, enabled, last_success, error_count FROM providers ORDER BY id')
    .all() as Array<{ id: string; enabled: number; last_success: string | null; error_count: number }>;
  return rows.map((row) => ({
    id: row.id,
    enabled: row.enabled === 1,
    lastSuccess: row.last_success,
    errorCount: row.error_count,
  }));
}

export interface SessionRecord {
  ts: string;
  tmdbId: string;
  title: string;
  mediaType: 'movie' | 'tv';
  provider: string;
  quality: string;
  ip: string;
  country: string;
  city: string;
  device: string;
  browser: string;
  fpHash: string | null;
}

export function insertSession(record: SessionRecord): void {
  getDb()
    .prepare(
      `INSERT INTO sessions
        (ts, tmdb_id, title, media_type, provider, quality, ip, country, city, device, browser, fp_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.ts,
      record.tmdbId,
      record.title,
      record.mediaType,
      record.provider,
      record.quality,
      record.ip,
      record.country,
      record.city,
      record.device,
      record.browser,
      record.fpHash,
    );
}

export function recordProviderResult(id: string, ok: boolean): void {  getDb()
    .prepare(
      `INSERT INTO providers (id, enabled, last_success, error_count) VALUES (?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_success = CASE WHEN ? THEN excluded.last_success ELSE providers.last_success END,
         error_count = CASE WHEN ? THEN 0 ELSE providers.error_count + 1 END`,
    )
    .run(id, ok ? new Date().toISOString() : null, ok ? 0 : 1, ok ? 1 : 0, ok ? 1 : 0);
}
