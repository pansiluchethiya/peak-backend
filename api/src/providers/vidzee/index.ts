import type { MediaRef, Provider, ProviderResult, RawSource } from '../types.js';
import { fetchJson, fetchText, mediaHeaders, USER_AGENT } from '../shared.js';
import { loadVidzeeCrypto } from './crypto.js';

const CORE = 'https://core.vidzee.wtf';
const PLAYER = 'https://player.vidzee.wtf';
const SERVER = 'dcloud';

interface VidzeePlainResponse {
  language?: string;
  url?: string;
  headers?: Record<string, string>;
}

interface VidzeeEncryptedResponse {
  c?: string;
}

interface DecryptedStream {
  language?: string;
  url?: string;
  headers?: Record<string, string>;
}

function streamUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${CORE}/streams/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}?s=${SERVER}&e=2`;
  }
  return `${CORE}/streams/movie/${encodeURIComponent(media.tmdbId)}?s=${SERVER}&e=2`;
}

function embedUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${PLAYER}/embed/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `${PLAYER}/embed/movie/${encodeURIComponent(media.tmdbId)}`;
}

/** Locate the player bundle that carries the decryption module. */
async function playerBundleUrl(media: MediaRef): Promise<string | undefined> {
  try {
    const html = await fetchText(embedUrl(media), { timeoutMs: 8000 });
    const match = /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i.exec(html);
    if (!match?.[1]) return undefined;
    return new URL(match[1], PLAYER).toString();
  } catch {
    return undefined;
  }
}

async function decryptPayload(media: MediaRef, payload: string): Promise<DecryptedStream | undefined> {
  const bundleUrl = await playerBundleUrl(media);
  if (!bundleUrl) return undefined;
  const crypto = await loadVidzeeCrypto(bundleUrl);
  if (!crypto) return undefined;
  try {
    const bytes = new Uint8Array(Buffer.from(payload, 'base64'));
    const plain = crypto.decrypt(bytes, 'player.vidzee.wtf');
    if (!plain || plain.length === 0) return undefined;
    return JSON.parse(new TextDecoder().decode(plain)) as DecryptedStream;
  } catch {
    return undefined;
  }
}

function toSource(stream: DecryptedStream, referer: string): RawSource | undefined {
  if (typeof stream.url !== 'string' || !/^https?:\/\//i.test(stream.url)) return undefined;
  return {
    rawUrl: stream.url,
    quality: 'auto',
    codec: /\.m3u8/i.test(stream.url) ? 'hls' : 'h264',
    headers: mediaHeaders(referer, stream.headers),
    adaptive: /\.m3u8/i.test(stream.url),
  };
}

export const vidzeeProvider: Provider = {
  id: 'vidzee',
  name: 'VidZee',
  description: 'VidZee core API with an encrypted stream index',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const referer = `${PLAYER}/`;

    try {
      const response = await fetchJson<VidzeePlainResponse & VidzeeEncryptedResponse>(
        streamUrl(media),
        { referer, timeoutMs: 10000 },
      );

      let stream: DecryptedStream | undefined;
      if (typeof response.url === 'string') {
        stream = { url: response.url, headers: response.headers, language: response.language };
      } else if (typeof response.c === 'string') {
        stream = await decryptPayload(media, response.c);
      }

      if (!stream) throw new Error('vidzee returned no stream url');

      const source = toSource(stream, referer);
      if (!source) throw new Error('vidzee stream url was invalid');

      return {
        sources: [source],
        subtitles: [],
        diagnostics: [{ provider: 'vidzee', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: embedUrl(media),
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(referer),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: 'vidzee',
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
