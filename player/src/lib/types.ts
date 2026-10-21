export type MediaType = 'movie' | 'tv';

export interface Media {
  type: MediaType;
  id: string;
  season?: number;
  episode?: number;
}

export interface Source {
  url: string;
  quality: string;
  codec: string;
  provider: string;
  expiresIn: number;
}

export interface Subtitle {
  url: string;
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

export interface StreamResponse {
  id: string;
  type: MediaType;
  title: string;
  year?: string;
  sources: Source[];
  subtitles: Subtitle[];
  meta?: { cacheHit: boolean; latencyMs: number };
  diagnostics: Diagnostic[];
}

export interface Branding {
  name: string;
  logoUrl: string;
  accentColor: string;
  tagline: string;
}

export const DEFAULT_BRANDING: Branding = {
  name: 'PeakMovies',
  logoUrl: '/logo.svg',
  accentColor: '#6366f1',
  tagline: 'Stream anything',
};

export interface Fingerprint {
  hash: string;
  userAgent: string;
  screen: string;
  timezone: string;
  language: string;
}
