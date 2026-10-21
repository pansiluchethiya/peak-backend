import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { buildServer } from '../src/index.js';

let app: Awaited<ReturnType<typeof buildServer>>;
const previousBranding = process.env.BRANDING_FILE;

beforeEach(() => {
  process.env.BRANDING_FILE = resolve(process.cwd(), '../config/branding.json');
  app = buildServer();
});

afterEach(async () => {
  await app.close();
  if (previousBranding === undefined) delete process.env.BRANDING_FILE;
  else process.env.BRANDING_FILE = previousBranding;
});

describe('branding', () => {
  it('serves the mounted branding config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/branding' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'PeakMovies', accentColor: '#6366f1' });
  });
});
