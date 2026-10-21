import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/index.js';

const apps: Awaited<ReturnType<typeof buildServer>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('health', () => {
  it('returns ok with uptime and dependency status', async () => {
    const app = buildServer();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
    expect(body.redis).toBeDefined();
    expect(body.db).toBeDefined();
  });
});
