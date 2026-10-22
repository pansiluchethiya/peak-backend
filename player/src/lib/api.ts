import type { Branding, Fingerprint, Media, StreamResponse } from './types';
import { DEFAULT_BRANDING } from './types';
import { fetchVidapiStream } from './vidapi';


function base(apiBase: string): string {
  return apiBase.replace(/\/+$/, '');
}

export async function fetchBranding(apiBase: string, signal?: AbortSignal): Promise<Branding> {
  try {
    const response = await fetch(`${base(apiBase)}/api/v1/branding`, { signal });
    if (!response.ok) return DEFAULT_BRANDING;
    const data = (await response.json()) as Partial<Branding>;
    return { ...DEFAULT_BRANDING, ...data };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function streamPath(media: Media): string {
  if (media.type === 'movie') return `/api/v1/stream/movie/${encodeURIComponent(media.id)}`;
  return `/api/v1/stream/tv/${encodeURIComponent(media.id)}/${media.season ?? 1}/${media.episode ?? 1}`;
}

export async function fetchStream(
  apiBase: string,
  media: Media,
  fingerprint: Fingerprint,
  options: { invalidate?: boolean; signal?: AbortSignal } = {},
): Promise<StreamResponse> {
  const params = new URLSearchParams({
    fpHash: fingerprint.hash,
    ua: fingerprint.userAgent,
    res: fingerprint.screen,
    tz: fingerprint.timezone,
    lang: fingerprint.language,
  });
  if (options.invalidate) params.set('invalidate', '1');

  const response = await fetch(`${base(apiBase)}${streamPath(media)}?${params.toString()}`, {
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Stream request failed (${response.status})`);
  }
  return (await response.json()) as StreamResponse;
}

export interface ProviderStatus {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

/** Fetch the provider catalogue (order + enabled state) from the API. */
export async function fetchProviders(
  apiBase: string,
  signal?: AbortSignal,
): Promise<ProviderStatus[]> {
  try {
    const response = await fetch(`${base(apiBase)}/api/v1/providers`, { signal, cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as { providers?: ProviderStatus[] };
    return Array.isArray(data.providers) ? data.providers : [];
  } catch {
    return [];
  }
}
