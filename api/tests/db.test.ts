import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, isProviderEnabled, recordProviderResult, resetDbForTests, setProviderEnabled } from '../src/services/db.js';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDbForTests();
});

describe('provider state', () => {
  it('counts consecutive failures and records the last success', () => {
    recordProviderResult('vidsrc', false);
    recordProviderResult('vidsrc', false);
    recordProviderResult('vidsrc', true);

    const row = getDb()
      .prepare('SELECT enabled, last_success, error_count FROM providers WHERE id = ?')
      .get('vidsrc') as { enabled: number; last_success: string | null; error_count: number };

    expect(row.error_count).toBe(0);
    expect(row.last_success).not.toBeNull();
  });

  it('defaults unknown providers to enabled and persists toggles', () => {
    expect(isProviderEnabled('vidapi')).toBe(true);
    setProviderEnabled('vidapi', false);
    expect(isProviderEnabled('vidapi')).toBe(false);
    setProviderEnabled('vidapi', true);
    expect(isProviderEnabled('vidapi')).toBe(true);
  });
});
