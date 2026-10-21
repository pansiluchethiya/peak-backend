import { describe, it, expect, vi } from 'vitest';
import { CacheService } from '../src/services/cache.js';

function fakeRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    dbsize: vi.fn(async () => 3),
    flushdb: vi.fn(async () => 'OK'),
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
  };
}

describe('redis-backed cache', () => {
  it('recovers after a transient redis failure instead of permanently downgrading', async () => {
    const redis = fakeRedis();
    redis.get
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(JSON.stringify('from-redis'));
    const cache = new CacheService(redis as never);

    expect(await cache.get('key')).toBeNull();
    expect(await cache.get('key')).toBe('from-redis');
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it('writes through to redis and reports the redis backend', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(JSON.stringify({ hello: 'world' }));
    const cache = new CacheService(redis as never);

    await cache.set('key', { hello: 'world' }, 60);

    expect(redis.set).toHaveBeenCalledWith('key', '{"hello":"world"}', 'EX', 60);
    expect(await cache.get('key')).toEqual({ hello: 'world' });
    expect(await cache.stats()).toMatchObject({ backend: 'redis', keys: 3 });
  });

  it('falls back to memory when redis is unavailable', async () => {
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('down'));
    redis.set.mockRejectedValue(new Error('down'));
    const cache = new CacheService(redis as never);

    await cache.set('key', 'memory-value', 60);
    expect(await cache.get('key')).toBe('memory-value');
    expect((await cache.stats()).backend).toBe('memory');
  });
});
