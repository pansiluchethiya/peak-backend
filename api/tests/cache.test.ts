import { describe, it, expect, beforeEach } from 'vitest';
import { getCache, resetCacheForTests } from '../src/services/cache.js';

beforeEach(() => {
  delete process.env.REDIS_HOST;
  resetCacheForTests();
});

describe('cache service', () => {
  it('stores and retrieves values', async () => {
    const cache = getCache();
    await cache.set('a', { hello: 'world' }, 60);
    await expect(cache.get('a')).resolves.toEqual({ hello: 'world' });
    await expect(cache.get('missing')).resolves.toBeNull();
  });

  it('expires values after their ttl', async () => {
    const cache = getCache();
    await cache.set('short', 'value', 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(cache.get('short')).resolves.toBeNull();
  });

  it('reports hit/miss stats and clears entries', async () => {
    const cache = getCache();
    await cache.set('a', 1, 60);
    await cache.get('a');
    await cache.get('b');

    expect(await cache.stats()).toMatchObject({ hits: 1, misses: 1, keys: 1, backend: 'memory' });

    await cache.clear();
    expect(await cache.stats()).toMatchObject({ keys: 0 });
    await expect(cache.get('a')).resolves.toBeNull();
  });
});
