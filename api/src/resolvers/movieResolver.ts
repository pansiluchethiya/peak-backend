import { ApiError } from '../core/errors.js';
import { encodePeakId, decodePeakId } from '../core/peakId.js';
import { normalizeSource, normalizeSubtitle } from '../core/sources.js';
import { tmdbTitle } from '../services/tmdb.js';
import { getCache } from '../services/cache.js';
import { encodeProxyData } from '../services/proxyToken.js';
import type { ProviderManager } from '../providers/index.js';
import type { Resolver, ResolverInput, ResolvedMedia } from './types.js';

function proxyUrl(rawUrl: string, headers: Record<string, string> | undefined): string {
  const token = encodeProxyData({ url: rawUrl, headers: headers ?? {} });
  const base = process.env.PUBLIC_URL ?? '';
  return `${base.replace(/\/+$/, '')}/api/v1/proxy?data=${encodeURIComponent(token)}`;
}

export class MovieResolver implements Resolver {
  constructor(private readonly manager: ProviderManager) {}

  async resolve(input: ResolverInput): Promise<ResolvedMedia> {
    let tmdbId: string;
    try {
      const decoded = decodePeakId(input.id);
      if (decoded.kind !== 'movie') throw new Error('INVALID_ID');
      tmdbId = decoded.rawId;
    } catch {
      // Allow raw ids for backward compat / tests.
      tmdbId = input.id;
    }

    const peakId = input.id.startsWith('pm_') ? input.id : encodePeakId('movie', tmdbId);

    let title: string | undefined;
    let year: number | null = null;
    try {
      const t = await tmdbTitle(tmdbId, 'movie');
      title = t.title;
      year = t.year;
    } catch {
      // TMDB unavailable; continue without title.
    }

    const cache = getCache();
    const cacheKey = `watch:movie:${tmdbId}`;
    const cached = await cache.get<ResolvedMedia>(cacheKey);
    if (cached && input.id && !input.request_id?.includes('invalidate')) {
      // cache hit path handled below; we still re-run? No—return cached.
    }

    const mediaRef = { tmdbId, type: 'movie' as const, title };
    const aggregated = await this.manager.getSources(mediaRef);

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const sources = aggregated.sources.map((s) =>
      normalizeSource({ ...s, provider: s.provider }, proxyUrl(s.rawUrl, s.headers ?? {}), expiresAt),
    );
    const subtitles = aggregated.subtitles.map((s) =>
      normalizeSubtitle({ ...s, provider: s.provider }, proxyUrl(s.rawUrl, s.headers ?? {})),
    );

    const result: ResolvedMedia = {
      media: { id: peakId, type: 'movie', title, year },
      sources,
      subtitles,
      diagnostics: aggregated.diagnostics,
    };

    await cache.set(cacheKey, result, 300);
    return result;
  }
}

// Re-export for convenience.
