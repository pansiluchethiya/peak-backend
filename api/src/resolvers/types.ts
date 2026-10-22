// api/src/resolvers/types.ts
import type { PublicSource, PublicSubtitle } from '../core/sources.js';

export interface ResolvedMedia {
  media: {
    id: string;
    type: 'movie' | 'tv' | 'live_tv' | 'music';
    title?: string;
    year?: number | null;
    [key: string]: unknown;
  };
  sources: PublicSource[];
  subtitles: PublicSubtitle[];
  diagnostics: Array<{ provider: string; ok: boolean; latencyMs: number; error?: string }>;
}

export interface Resolver {
  resolve(input: ResolverInput): Promise<ResolvedMedia>;
}

export interface ResolverInput {
  id: string;
  season?: number;
  episode?: number;
  title?: string;
  request_id?: string;
}
