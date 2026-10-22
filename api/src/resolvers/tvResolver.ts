// api/src/resolvers/tvResolver.ts
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

export class TvResolver implements Resolver {
  constructor(private readonly manager: ProviderManager) {}

  async resolve(input: ResolverInput): Promise<ResolvedMedia> {
    if (!Number.isInteger(input.season) || (input.season ?? 0) < 1) {
      throw new ApiError('INVALID_SEASON', 'season must be a positive integer');
    }
    if (!Number.isInteger(input.episode) || (input.episode ?? 0) < 1) {
      throw new ApiError('INVALID_EPISODE', 'episode must be a positive integer');
    }
    const season = input.season as number;
    const episode = input.episode as number;

    let tmdbId: string;
    try {
      const decoded = decodePeakId(input.id);
      if (decoded.kind !== 'tv') throw new Error('INVALID_ID');
      tmdbId = decoded.rawId;
    } catch {
      tmdbId = input.id;
    }

    const peakId = input.id.startsWith('pm_') ? input.id : encodePeakId('tv', tmdbId);

    let title: string | undefined;
    let year: number | null = null;
    try {
      const t = await tmdbTitle(tmdbId, 'tv');
      title = t.title;
      year = t.year;
    } catch {
      // TMDB unavailable.
    }

    const cache = getCache();
    const cacheKey = `watch:tv:${tmdbId}:${season}:${episode}`;
    const cached = await cache.get<ResolvedMedia>(cacheKey);
    if (cached) return { ...cached, media: { ...cached.media, id: peakId, season, episode } };

    const mediaRef = { tmdbId, type: 'tv' as const, season, episode, title };
    const aggregated = await this.manager.getSources(mediaRef);

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const sources = aggregated.sources.map((s) =>
      normalizeSource({ ...s, provider: s.provider ?? 'unknown', language: s.language }, proxyUrl(s.rawUrl, s.headers ?? {}), expiresAt),
    );
    const subtitles = aggregated.subtitles.map((s) =>
      normalizeSubtitle({ ...s, provider: s.provider ?? 'unknown' }, proxyUrl(s.rawUrl, s.headers ?? {})),
    );

    const result: ResolvedMedia = {
      media: { id: peakId, type: 'tv', season, episode, title, year },
      sources,
      subtitles,
      diagnostics: aggregated.diagnostics,
    };

    await cache.set(cacheKey, result, 300);
    return result;
  }
}
