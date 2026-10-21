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

class CacheService {
  private readonly memory = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;
  private redis: Redis | null = null;
  private backend: 'redis' | 'memory' = 'memory';

  constructor() {
    const host = process.env.REDIS_HOST;
    if (host && process.env.NODE_ENV !== 'test') {
      this.backend = 'redis';
      this.redis = new Redis({
        host,
        port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (attempt: number) => (attempt > 3 ? null : 200),
      });
      this.redis.on('error', () => this.downgradeToMemory());
      this.redis.connect().catch(() => this.downgradeToMemory());
    }
  }

  private downgradeToMemory(): void {
    this.backend = 'memory';
    this.redis?.disconnect();
    this.redis = null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis && this.backend === 'redis') {
      try {
        const raw = await this.redis.get(key);
        if (raw !== null) {
          this.hits += 1;
          return JSON.parse(raw) as T;
        }
        this.misses += 1;
        return null;
      } catch {
        this.downgradeToMemory();
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
    this.memory.set(key, { value, expiresAt });

    if (this.redis && this.backend === 'redis') {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
      } catch {
        this.downgradeToMemory();
      }
    }
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redis && this.backend === 'redis') {
      try {
        await this.redis.del(key);
      } catch {
        this.downgradeToMemory();
      }
    }
  }

  async stats(): Promise<CacheStats> {
    let keys = this.memory.size;
    if (this.redis && this.backend === 'redis') {
      try {
        keys = await this.redis.dbsize();
      } catch {
        this.downgradeToMemory();
      }
    }
    return { hits: this.hits, misses: this.misses, keys, backend: this.backend };
  }

  async clear(): Promise<void> {
    this.memory.clear();
    this.hits = 0;
    this.misses = 0;
    if (this.redis && this.backend === 'redis') {
      try {
        await this.redis.flushdb();
      } catch {
        this.downgradeToMemory();
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
