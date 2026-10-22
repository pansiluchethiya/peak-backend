export interface Totals {
  today: number;
  week: number;
  month: number;
}

export interface Stats {
  totals: Totals;
  topTitles: Array<{ title: string; plays: number }>;
  activeUsers: number;
  errorRate: number;
  providerErrors: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  lastSuccess: string | null;
  errorCount: number;
  order?: number;
}

export interface ProviderList {
  providers: ProviderInfo[];
}

export interface RawSource {
  rawUrl: string;
  quality: string;
  codec: string;
  provider: string;
  headers?: Record<string, string>;
}

export interface RawSubtitle {
  rawUrl: string;
  lang: string;
  label: string;
  provider: string;
}

export interface Diagnostic {
  provider: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface TestResult {
  sources: RawSource[];
  subtitles: RawSubtitle[];
  diagnostics: Diagnostic[];
  latencyMs: number;
}

export interface SessionRow {
  id: number;
  timestamp: string;
  tmdbId: string;
  title: string | null;
  mediaType: 'movie' | 'tv';
  provider: string | null;
  quality: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  fpHash: string | null;
}

export interface SessionsResponse {
  sessions: SessionRow[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  backend: 'redis' | 'memory';
}

export interface DbStats {
  path: string;
  sizeBytes: number;
  sessions: number;
}

export interface Branding {
  name: string;
  logoUrl: string;
  accentColor: string;
  tagline: string;
}
