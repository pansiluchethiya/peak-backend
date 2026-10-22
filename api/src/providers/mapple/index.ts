import { createHash } from 'node:crypto';
import type { MediaRef, Provider, ProviderResult, RawSource } from '../types.js';
import {
  CookieJar,
  fetchJsonWithJar,
  fetchTextWithJar,
  mediaHeaders,
  USER_AGENT,
} from '../shared.js';

const BASE = 'https://mapple.fun';

/** Mapple serves the same title from several mirrors. */
const SERVERS = ['mapple', 's25', 's10', 's2', 's28'];

interface SessionResponse {
  token?: string;
  expiresAt?: number;
}

interface MediaSessionResponse {
  success?: boolean;
  error?: string;
  token?: string;
  requiresPow?: boolean;
  pow?: { challengeId?: string; challenge?: string; difficulty?: number };
}

interface EncryptResponse {
  url?: string;
}

interface StreamResponse {
  success?: boolean;
  data?: { stream_url?: string; tmdb_id?: string; media_type?: string };
}

function watchUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${BASE}/watch/tv/${encodeURIComponent(media.tmdbId)}-${media.season ?? 1}-${media.episode ?? 1}`;
  }
  return `${BASE}/watch/movie/${encodeURIComponent(media.tmdbId)}`;
}

/** Mapple identifies episodes with `{season}-{episode}`. */
function tvSlug(media: MediaRef): string {
  return `${media.season ?? 1}-${media.episode ?? 1}`;
}

/** Count the leading zero bits of a digest. */
function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

/**
 * Solve the SHA-256 proof of work of the player: find a nonce so that
 * `sha256(challenge + nonce)` starts with `difficulty` zero bits.
 */
function solvePow(challenge: string, difficulty: number, timeoutMs = 20000): string | undefined {
  const deadline = Date.now() + timeoutMs;
  let nonce = 0;
  while (Date.now() < deadline) {
    const digest = createHash('sha256').update(`${challenge}${nonce}`).digest();
    if (leadingZeroBits(digest) >= difficulty) return String(nonce);
    nonce += 1;
  }
  return undefined;
}

export const mappleProvider: Provider = {
  id: 'mapple',
  name: 'Mapple',
  description: 'Mapple watch API (session token, proof of work, encrypted stream url)',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const jar = new CookieJar();
    const referer = watchUrl(media);

    try {
      // The session endpoint is bound to the cookies of the watch page.
      await fetchTextWithJar(referer, jar, { referer: `${BASE}/`, timeoutMs: 10000 });

      const session = await fetchJsonWithJar<SessionResponse>(`${BASE}/api/ui/session`, jar, {
        method: 'POST',
        referer: `${BASE}/`,
        timeoutMs: 10000,
      });
      const requestToken = session.data?.token;
      if (!requestToken) throw new Error('mapple session returned no token');

      const body = {
        mediaId: Number(media.tmdbId),
        mediaType: media.type,
        tv_slug: media.type === 'tv' ? tvSlug(media) : '',
        requestToken,
      };

      let mediaSession = await fetchJsonWithJar<MediaSessionResponse>(`${BASE}/api/media-session`, jar, {
        method: 'POST',
        body,
        referer: `${BASE}/`,
        timeoutMs: 12000,
      });

      if (mediaSession.data?.requiresPow && mediaSession.data.pow) {
        const { challengeId, challenge, difficulty } = mediaSession.data.pow;
        if (!challengeId || !challenge) throw new Error('mapple challenge was incomplete');
        const nonce = solvePow(challenge, difficulty ?? 18);
        if (!nonce) throw new Error('mapple proof of work timed out');
        mediaSession = await fetchJsonWithJar<MediaSessionResponse>(`${BASE}/api/media-session`, jar, {
          method: 'POST',
          body: { ...body, pow: { challengeId, nonce } },
          referer: `${BASE}/`,
          timeoutMs: 12000,
        });
      }

      const streamToken = mediaSession.data?.token;
      if (!streamToken) {
        throw new Error(mediaSession.data?.error ?? 'mapple media session failed');
      }

      let lastError = 'mapple returned no playable source';

      for (const source of SERVERS) {
        const encrypted = await fetchJsonWithJar<EncryptResponse>(`${BASE}/api/encrypt`, jar, {
          method: 'POST',
          body: {
            data:
              media.type === 'tv'
                ? { mediaId: Number(media.tmdbId), mediaType: 'tv', tv_slug: tvSlug(media), source }
                : { mediaId: Number(media.tmdbId), mediaType: 'movie', source },
            endpoint: 'stream-encrypted',
            requestToken,
          },
          referer: `${BASE}/`,
          timeoutMs: 12000,
        });

        const relative = encrypted.data?.url;
        if (!relative) {
          lastError = `mapple encryption for ${source} returned no url`;
          continue;
        }

        const streamUrl = new URL(relative, BASE);
        streamUrl.searchParams.set('requestToken', requestToken);
        streamUrl.searchParams.set('token', streamToken);

        const stream = await fetchJsonWithJar<StreamResponse>(streamUrl, jar, {
          referer: `${BASE}/`,
          timeoutMs: 12000,
        });

        const rawUrl = stream.data?.data?.stream_url;
        if (!rawUrl || rawUrl.includes('playback-unavailable')) {
          lastError = `mapple server ${source} has no stream`;
          continue;
        }

        const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, BASE).toString();
        const result: RawSource = {
          rawUrl: resolved,
          quality: 'auto',
          codec: /\.m3u8/i.test(resolved) ? 'hls' : 'h264',
          headers: mediaHeaders(`${BASE}/`),
          adaptive: /\.m3u8/i.test(resolved),
        };

        return {
          sources: [result],
          subtitles: [],
          diagnostics: [{ provider: 'mapple', ok: true, latencyMs: Date.now() - started }],
        };
      }

      throw new Error(lastError);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: referer,
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(`${BASE}/`),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'mapple',
            ok: false,
            latencyMs: Date.now() - started,
            error: message,
          },
        ],
      };
    }
  },
};

export { USER_AGENT };
