export class TmdbUnavailableError extends Error {
  readonly code = 'TMDB_UNAVAILABLE';

  constructor() {
    super('TMDB_API_KEY is not configured');
    this.name = 'TmdbUnavailableError';
  }
}

export type MediaType = 'movie' | 'tv';

export interface TmdbResult {
  tmdbId: string;
  type: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface TmdbTitle {
  title: string;
  year: number | null;
}

const API_BASE = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  });
}

function requireKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new TmdbUnavailableError();
  return key;
}

async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = requireKey();
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('api_key', key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  return (await res.json()) as T;
}

function yearOf(date: string | undefined): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function normalize(raw: Record<string, unknown>, type: MediaType): TmdbResult {
  return {
    tmdbId: String(raw.id),
    type,
    title: String(type === 'movie' ? raw.title : raw.name),
    year: yearOf((type === 'movie' ? raw.release_date : raw.first_air_date) as string | undefined),
    posterPath: (raw.poster_path as string | null | undefined) ?? null,
  };
}

export async function tmdbSearch(query: string, type: MediaType): Promise<TmdbResult[]> {
  requireKey();
  const data = await cached(`search:${type}:${query}`, () =>
    request<{ results: Record<string, unknown>[] }>(`/search/${type}`, { query }),
  );
  return data.results.map((item) => normalize(item, type));
}

export async function tmdbTitle(tmdbId: string, type: MediaType): Promise<TmdbTitle> {
  requireKey();
  const data = await cached(`title:${type}:${tmdbId}`, () =>
    request<Record<string, unknown>>(`/${type}/${tmdbId}`),
  );
  return {
    title: String(type === 'movie' ? data.title : data.name),
    year: yearOf((type === 'movie' ? data.release_date : data.first_air_date) as string | undefined),
  };
}

export async function tmdbRecommendations(tmdbId: string, type: MediaType): Promise<TmdbResult[]> {
  requireKey();
  const data = await cached(`recs:${type}:${tmdbId}`, () =>
    request<{ results: Record<string, unknown>[] }>(`/${type}/${tmdbId}/recommendations`),
  );
  return data.results.map((item) => normalize(item, type));
}
