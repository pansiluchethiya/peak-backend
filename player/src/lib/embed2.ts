// src/lib/embed2.ts
// Provider for 2embed.cc – builds embed URLs for movies and TV series.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

function build2embedUrl(media: Media): string {
  const base = 'https://www.2embed.cc';
  if (media.type === 'movie') {
    // Accept either TMDB ID or IMDb ID; we just use the id as‑is.
    return `${base}/embed/${encodeURIComponent(media.id)}`;
  }
  // TV – use embedtv endpoint with season and episode
  const season = media.season ?? 1;
  const episode = media.episode ?? 1;
  return `${base}/embedtv/${encodeURIComponent(media.id)}&s=${season}&e=${episode}`;
}

/** Fetch a StreamResponse for 2embed.cc */
export async function fetch2embedStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  try {
    const url = build2embedUrl(media);
    const source: Source = {
      url,
      quality: 'auto',
      codec: 'html5',
      provider: '2embed',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: '2embed Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: '2embed', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: '2embed Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
