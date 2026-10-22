// api/src/core/sources.ts
import { createHash } from 'node:crypto';
import type { RawSource, RawSubtitle } from '../providers/types.js';

export interface PublicSource {
  id: string;
  type: 'hls' | 'dash' | 'audio' | 'progressive' | 'embed';
  url: string;
  quality: string;
  language: string;
  headers: Record<string, string>;
  expires_at: string;
}

export interface PublicSubtitle {
  id: string;
  url: string;
  lang: string;
  label: string;
  provider: string;
}

export function sourceTypeOf(source: RawSource): PublicSource['type'] {
  if (source.codec === 'html5') return 'embed';
  if (source.adaptive && /\.m3u8/i.test(source.rawUrl)) return 'hls';
  if (/\.m3u8/i.test(source.rawUrl)) return 'hls';
  if (/\.mpd/i.test(source.rawUrl)) return 'dash';
  if (/\.(mp3|aac|ogg|wav|m4a)(\?|$)/i.test(source.rawUrl)) return 'audio';
  return 'progressive';
}

export function stableSourceId(provider: string, rawUrl: string): string {
  const hash = createHash('sha256').update(`${provider}:${rawUrl}`).digest('hex').slice(0, 16);
  return `src_${hash}`;
}

export function normalizeSource(
  source: RawSource & { provider: string },
  proxyUrl: string,
  expiresAt: string,
): PublicSource {
  return {
    id: stableSourceId(source.provider, source.rawUrl),
    type: sourceTypeOf(source),
    url: proxyUrl,
    quality: source.quality || 'auto',
    language: source.language ?? 'und',
    headers: {},
    expires_at: expiresAt,
  };
}

export function normalizeSubtitle(
  subtitle: RawSubtitle & { provider: string },
  proxyUrl: string,
): PublicSubtitle {
  return {
    id: stableSourceId(subtitle.provider, subtitle.rawUrl),
    url: proxyUrl,
    lang: subtitle.lang,
    label: subtitle.label,
    provider: subtitle.provider,
  };
}
