// src/lib/mapple.ts
// Provider for MappleTV (https://mapple.fun)
// The player page renders the HLS manifest URL dynamically. We fetch the page
// HTML and extract any *.m3u8 URLs using a regular expression. The first match
// is returned as the source URL.

import type { Media, StreamResponse, Source, Diagnostic } from './types';

/** Build the MappleTV watch page URL for a given media */
function buildMappleWatchUrl(media: Media): string {
  const base = 'https://mapple.fun/watch';
  if (media.type === 'movie') {
    return `${base}/movie/${media.id}`;
  }
  // TV series – the site uses season/episode in the path
  const season = media.season ?? 1;
  const episode = media.episode ?? 1;
  return `${base}/tv/${media.id}/${season}/${episode}`;
}

/** Extract the first .m3u8 URL from a block of text */
function extractM3U8(html: string): string | null {
  const regex = /https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/gi;
  const match = regex.exec(html);
  return match ? match[0] : null;
}

/** Fetch a StreamResponse for MappleTV */
export async function fetchMappleStream(media: Media): Promise<StreamResponse> {
  const start = performance.now();
  const watchUrl = buildMappleWatchUrl(media);
  const diagnostics: Diagnostic[] = [];
  try {
    const resp = await globalThis.fetch(watchUrl);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const html = await resp.text();
    const m3u8 = extractM3U8(html);
    if (!m3u8) {
      throw new Error('No .m3u8 URL found in page');
    }
    const source: Source = {
      url: m3u8,
      quality: 'auto',
      codec: 'hls',
      provider: 'mapple',
      adaptive: true,
      expiresIn: 0,
    };
    return {
      id: media.id,
      type: media.type,
      title: 'MappleTV Stream',
      sources: [source],
      subtitles: [],
      diagnostics,
    };
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ provider: 'mapple', ok: false, latencyMs: performance.now() - start, error: err.message });
    return {
      id: media.id,
      type: media.type,
      title: 'MappleTV Stream (error)',
      sources: [],
      subtitles: [],
      diagnostics,
    };
  }
}
