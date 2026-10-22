// src/lib/vidzee.ts
// Provider for Vidzee.wtf – builds embed URLs based on public API docs.
// Docs: https://vidzee.wtf/#api-docs
// The API expects a query like:
//   https://vidzee.wtf/api/stream?tmdb={id}&type={movie|tv}&season={s}&episode={e}
// For movies only `tmdb` and `type=movie` are required.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

function buildVidzeeUrl(media: Media): string {
  const base = 'https://vidzee.wtf/api/stream';
  const params = new URLSearchParams({
    tmdb: media.id,
    type: media.type,
  });
  if (media.type === 'tv') {
    params.append('season', String(media.season ?? 1));
    params.append('episode', String(media.episode ?? 1));
  }
  return `${base}?${params.toString()}`;
}

/** Fetch a StreamResponse for Vidzee.wtf */
export async function fetchVidzeeStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  try {
    const url = buildVidzeeUrl(media);
    const source: Source = {
      url,
      quality: 'auto',
      codec: 'html5',
      provider: 'vidzee',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: 'Vidzee Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: 'vidzee', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: 'Vidzee Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
