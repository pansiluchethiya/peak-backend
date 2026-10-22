// src/lib/vixsrc.ts
// Provider for Vixsrc.to – builds embed URLs based on public docs (assumed).
// Docs: https://vixsrc.to/ (no explicit API URL, but typical pattern is:
//   https://vixsrc.to/api/stream/{id}?type={movie|tv}&season={s}&episode={e}
// This implementation follows that pattern.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

function buildVixsrcUrl(media: Media): string {
  const base = 'https://vixsrc.to/api/stream';
  const path = `${base}/${encodeURIComponent(media.id)}`;
  const params = new URLSearchParams({
    type: media.type,
  });
  if (media.type === 'tv') {
    params.append('season', String(media.season ?? 1));
    params.append('episode', String(media.episode ?? 1));
  }
  return `${path}?${params.toString()}`;
}

/** Fetch a StreamResponse for Vixsrc.to */
export async function fetchVixsrcStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  try {
    const url = buildVixsrcUrl(media);
    const source: Source = {
      url,
      quality: 'auto',
      codec: 'html5',
      provider: 'vixsrc',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: 'Vixsrc Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: 'vixsrc', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: 'Vixsrc Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
