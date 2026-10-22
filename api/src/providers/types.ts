export type MediaType = 'movie' | 'tv';

export interface MediaRef {
  tmdbId: string;
  type: MediaType;
  season?: number;
  episode?: number;
  title?: string;
}

export interface RawSource {
  rawUrl: string;
  quality: string;
  codec: string;
  headers?: Record<string, string>;
  provider?: string;
  /** True when the URL is a multi-bitrate master playlist suitable for ABR. */
  adaptive?: boolean;
}

export interface RawSubtitle {
  rawUrl: string;
  lang: string;
  label: string;
  headers?: Record<string, string>;
}

export interface ProviderResult {
  sources: RawSource[];
  subtitles: RawSubtitle[];
  diagnostics?: ProviderDiagnostic[];
}

export interface ProviderDiagnostic {
  provider: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface AggregatedResult {
  sources: Array<RawSource & { provider: string }>;
  subtitles: Array<RawSubtitle & { provider: string }>;
  diagnostics: ProviderDiagnostic[];
}

export interface Provider {
  id: string;
  name: string;
  /** Short human readable summary shown in the admin dashboard. */
  description?: string;
  /** Default-on switch; the SQLite toggle is authoritative at runtime. */
  enabled?: boolean;
  getSources(media: MediaRef): Promise<ProviderResult>;
}
