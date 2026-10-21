import { Redis } from 'ioredis';

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  backend: 'redis' | 'memory';
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  del(key: string): Promise<unknown>;
  ping(): Promise<string>;
  dbsize(): Promise<number>;
  flushdb(): Promise<unknown>;
  on(event: string, listener: (...args: never[]) => void): unknown;
  connect(): Promise<unknown>;
}

const MAX_MEMORY_ENTRIES = 500;

export class CacheService {
  private readonly memory = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;
  private readonly redis: RedisLike | null;
  private redisDown = false;

  constructor(redisOverride?: RedisLike | null) {
    if (redisOverride !== undefined) {
      this.redis = redisOverride;
      return;
    }

    const host = process.env.REDIS_HOST;
    if (!host || process.env.NODE_ENV === 'test') {
      this.redis = null;
      return;
    }

    // Keep the client alive across transient failures. ioredis reconnects and
    // commands are queued until the connection is ready; reads/writes fall back
    // to the in-process cache while it is unavailable.
    const client = new Redis({
      host,
      port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
    });
    client.on('ready', () => {
      this.redisDown = false;
    });
    client.on('error', () => {
      this.redisDown = true;
    });
    void client.connect().catch(() => {
      this.redisDown = true;
    });
    this.redis = client as unknown as RedisLike;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        this.redisDown = false;
        if (raw !== null) {
          this.hits += 1;
          return JSON.parse(raw) as T;
        }
        this.misses += 1;
        return null;
      } catch {
        this.redisDown = true;
      }
    }

    const entry = this.memory.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      this.hits += 1;
      return entry.value as T;
    }
    if (entry) this.memory.delete(key);
    this.misses += 1;
    return null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;

    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
        this.redisDown = false;
        return;
      } catch {
        this.redisDown = true;
      }
    }

    for (const [cachedKey, entry] of this.memory) {
      if (entry.expiresAt <= Date.now()) this.memory.delete(cachedKey);
    }
    while (this.memory.size >= MAX_MEMORY_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
    this.memory.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(key);
        this.redisDown = false;
      } catch {
        this.redisDown = true;
      }
    }
  }

  async ping(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const response = await this.redis.ping();
      this.redisDown = response !== 'PONG';
      return response === 'PONG';
    } catch {
      this.redisDown = true;
      return false;
    }
  }

  async stats(): Promise<CacheStats> {
    let keys = this.memory.size;
    let backend: 'redis' | 'memory' = 'memory';
    if (this.redis && !this.redisDown) {
      try {
        keys = await this.redis.dbsize();
        backend = 'redis';
      } catch {
        this.redisDown = true;
      }
    }
    return { hits: this.hits, misses: this.misses, keys, backend };
  }

  async clear(): Promise<void> {
    this.memory.clear();
    this.hits = 0;
    this.misses = 0;
    if (this.redis) {
      try {
        await this.redis.flushdb();
        this.redisDown = false;
      } catch {
        this.redisDown = true;
      }
    }
  }
}

let instance: CacheService | null = null;

export function getCache(): CacheService {
  if (!instance) instance = new CacheService();
  return instance;
}

export function resetCacheForTests(): void {
  instance = null;
}
