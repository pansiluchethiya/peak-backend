// src/lib/rivestream.ts
// Provider for Rivestream.app – builds embed URLs based on the public docs.
// The docs (https://www.rivestream.app/embed/docs) expose an endpoint
//   https://www.rivestream.app/embed/{type}/{id}?season={s}&episode={e}
// where `type` is `movie` or `tv`.  The provider returns a StreamResponse
// containing a single source that points directly at the embed URL.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

function buildRivestreamUrl(media: Media): string {
  const base = 'https://www.rivestream.app/embed';
  if (media.type === 'movie') {
    return `${base}/movie/${encodeURIComponent(media.id)}`;
  }
  // TV – season and episode defaults to 1 if omitted
  const season = media.season ?? 1;
  const episode = media.episode ?? 1;
  return `${base}/tv/${encodeURIComponent(media.id)}?season=${season}&episode=${episode}`;
}

/** Fetch a StreamResponse for Rivestream.app */
export async function fetchRivestreamStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  try {
    const url = buildRivestreamUrl(media);
    const source: Source = {
      url,
      quality: 'auto',
      codec: 'html5',
      provider: 'rivestream',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: 'Rivestream Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: 'rivestream', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: 'Rivestream Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
