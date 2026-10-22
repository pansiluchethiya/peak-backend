// src/lib/vidapi.ts
// Helper utilities for integrating VidAPI (https://vidapi.ru/api).
// VidAPI provides iframe embed URLs for movies and TV series.
// This module builds the embed URL based on our Media type and
// returns a mock StreamResponse compatible with the existing player.

import type { Media, StreamResponse } from './types';

/** Build the VidAPI embed URL for the given media. */
export function buildVidapiEmbedUrl(media: Media): string {
  const base = 'https://vaplayer.ru/embed';
  if (media.type === 'movie') {
    return `${base}/movie/${encodeURIComponent(media.id)}`;
  }
  const season = media.season ?? 1;
  const episode = media.episode ?? 1;
  return `${base}/tv/${encodeURIComponent(media.id)}/${season}/${episode}`;
}

/** Return a mock StreamResponse using the VidAPI embed URL as a source. */
export async function fetchVidapiStream(media: Media): Promise<StreamResponse> {
  const embedUrl = buildVidapiEmbedUrl(media);
  // VidAPI does not provide detailed metadata via JSON; we synthesize minimal data.
  return {
    id: media.id,
    type: media.type,
    title: 'Unknown Title', // No title information via embed.
    sources: [
      {
        url: embedUrl,
        quality: 'auto',
        codec: 'html5',
        provider: 'vidapi',
        adaptive: true,
        expiresIn: 0,
      },
    ],
    subtitles: [],
    diagnostics: [],
  };
}
