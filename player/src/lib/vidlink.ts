// src/lib/vidlink.ts
// Provider for Vidlink.pro – builds embed URLs for movies, TV and anime.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

function buildVidlinkUrl(media: Media): string {
  const base = 'https://vidlink.pro';
  if (media.type === 'movie') {
    // Assume TMDB ID is provided in media.id
    return `${base}/movie/${encodeURIComponent(media.id)}`;
  }
  // TV series – require season & episode
  const season = media.season ?? 1;
  const episode = media.episode ?? 1;
  return `${base}/tv/${encodeURIComponent(media.id)}/${season}/${episode}`;
}

/** Fetch a StreamResponse for Vidlink.pro */
export async function fetchVidlinkStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  try {
    const url = buildVidlinkUrl(media);
    const source: Source = {
      url,
      quality: 'auto',
      codec: 'html5',
      provider: 'vidlink',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: 'Vidlink Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: 'vidlink', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: 'Vidlink Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
