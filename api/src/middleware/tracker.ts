import type { FastifyRequest } from 'fastify';
import { insertSession } from '../services/db.js';
import { geolocate } from '../services/geo.js';
import type { MediaType } from '../providers/types.js';

export interface FingerprintQuery {
  fpHash?: string;
  ua?: string;
  res?: string;
  tz?: string;
  lang?: string;
  title?: string;
}

export interface TrackInfo {
  tmdbId: string;
  type: MediaType;
  title: string;
  provider: string;
  quality: string;
}

export function parseUserAgent(ua: string): { device: 'mobile' | 'tablet' | 'desktop'; browser: string } {
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? 'tablet'
    : /Mobile|iPhone|iPod|Android/i.test(ua)
      ? 'mobile'
      : 'desktop';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return { device, browser };
}

export async function trackStream(
  request: FastifyRequest,
  info: TrackInfo,
  fingerprint: FingerprintQuery = {},
): Promise<void> {
  try {
    const ua = fingerprint.ua ?? (request.headers['user-agent'] as string | undefined) ?? '';
    const { device, browser } = parseUserAgent(ua);
    const geo = await geolocate(request.ip);

    insertSession({
      ts: new Date().toISOString(),
      tmdbId: info.tmdbId,
      title: info.title,
      mediaType: info.type,
      provider: info.provider,
      quality: info.quality,
      ip: request.ip,
      country: geo.country,
      city: geo.city,
      device,
      browser,
      fpHash: fingerprint.fpHash ?? null,
    });
  } catch (error) {
    request.log.warn({ error }, 'failed to track stream request');
  }
}
