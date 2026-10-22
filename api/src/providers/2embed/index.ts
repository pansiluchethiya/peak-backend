import type { MediaRef, Provider, ProviderResult, RawSource, RawSubtitle } from '../types.js';
import { fetchJson, fetchText, mediaHeaders, USER_AGENT } from '../shared.js';

const TWOEMBED = 'https://www.2embed.cc';
const BUZZ = 'https://vidsrc.buzz';

interface BuzzSourcesResponse {
  status?: string;
  servers?: Array<{ ref?: string; name?: string; lang?: string | null }>;
}

interface BuzzRaceResponse {
  cands?: Array<{ ref?: string; url?: string; type?: string }>;
}

interface BuzzSubsResponse {
  subs?: Array<{ label?: string; lang?: string; ref?: string }>;
}

interface BuzzPage {
  id?: string;
  t?: string;
  type?: string;
  s?: number;
  e?: number;
}

/** The buzz player keeps its state in a `var Q = {...}` block on the page. */
function parseBuzzPage(html: string): BuzzPage | undefined {
  const match = /var Q = (\{[\s\S]*?\});/.exec(html);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as BuzzPage;
  } catch {
    return undefined;
  }
}

/** Signed references embed the target url in a base64 payload. */
function referenceUrl(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const payload = ref.split('.')[0];
  if (!payload) return undefined;
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { u?: string };
    return typeof parsed.u === 'string' ? parsed.u : undefined;
  } catch {
    return undefined;
  }
}

function embedUrl(media: MediaRef): string {
  if (media.type === 'tv') {
    return `${TWOEMBED}/embedtv/${encodeURIComponent(media.tmdbId)}&s=${media.season ?? 1}&e=${media.episode ?? 1}`;
  }
  return `${TWOEMBED}/embed/${encodeURIComponent(media.tmdbId)}`;
}

/** The 2embed page points at the buzz player with the resolved imdb id. */
async function buzzEmbedUrl(media: MediaRef): Promise<string> {
  try {
    const html = await fetchText(embedUrl(media), { timeoutMs: 8000 });
    const match = /data-src=["']([^"']*vidsrc\.buzz[^"']+)["']/i.exec(html);
    if (match?.[1]) return new URL(match[1], TWOEMBED).toString();
    const imdb = /2embed\.cc\/embed\/(tt\d+)/i.exec(html)?.[1];
    if (imdb) {
      return media.type === 'tv'
        ? `${BUZZ}/embed/tv/${imdb}/${media.season ?? 1}/${media.episode ?? 1}`
        : `${BUZZ}/embed/movie/${imdb}`;
    }
  } catch {
    // fall through to the default buzz path
  }
  return media.type === 'tv'
    ? `${BUZZ}/embed/tv/${encodeURIComponent(media.tmdbId)}/${media.season ?? 1}/${media.episode ?? 1}`
    : `${BUZZ}/embed/movie/${encodeURIComponent(media.tmdbId)}`;
}

function apiUrl(media: MediaRef, action: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${BUZZ}/pl/api.php`);
  url.searchParams.set('a', action);
  url.searchParams.set('type', media.type === 'tv' ? 'tv' : 'movie');
  url.searchParams.set('id', extra.id ?? media.tmdbId);
  url.searchParams.set('s', extra.s ?? String(media.season ?? 0));
  url.searchParams.set('e', extra.e ?? String(media.episode ?? 0));
  if (extra.t) url.searchParams.set('t', extra.t);
  return url.toString();
}

export const twoEmbedProvider: Provider = {
  id: '2embed',
  name: '2Embed',
  description: '2Embed aggregator backed by the vidsrc.buzz player',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const started = Date.now();
    const sources: RawSource[] = [];
    const subtitles: RawSubtitle[] = [];

    try {
      const playerUrl = await buzzEmbedUrl(media);
      const html = await fetchText(playerUrl, { referer: TWOEMBED, timeoutMs: 10000 });
      const page = parseBuzzPage(html);
      if (!page?.t) throw new Error('2embed player page had no session token');

      const id = page.id ?? media.tmdbId;
      const token = page.t;

      const serversResponse = await fetchJson<BuzzSourcesResponse>(
        apiUrl(media, 'sources', { id, s: '0', e: '0', t: token }),
        { referer: playerUrl, timeoutMs: 10000 },
      );
      const refs = (serversResponse.servers ?? [])
        .map((server) => server.ref)
        .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
      if (refs.length === 0) throw new Error('2embed returned no servers');

      const race = await fetchJson<BuzzRaceResponse>(
        `${BUZZ}/pl/api.php?a=race&refs=${encodeURIComponent(refs.slice(0, 4).join(','))}`,
        { referer: playerUrl, timeoutMs: 10000 },
      );
      for (const candidate of race.cands ?? []) {
        const rawUrl = candidate.url
          ? new URL(candidate.url, BUZZ).toString()
          : referenceUrl(candidate.ref);
        if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;
        sources.push({
          rawUrl,
          quality: 'auto',
          codec: candidate.type === 'hls' || /\.m3u8/i.test(rawUrl) ? 'hls' : 'h264',
          headers: mediaHeaders(playerUrl),
          adaptive: true,
        });
      }

      if (sources.length === 0) {
        // The race endpoint failed: the signed server reference still carries a
        // playable url for some mirrors.
        for (const ref of refs) {
          const rawUrl = referenceUrl(ref);
          if (!rawUrl) continue;
          sources.push({
            rawUrl,
            quality: 'auto',
            codec: 'h264',
            headers: mediaHeaders(playerUrl),
            adaptive: false,
          });
        }
      }

      try {
        const subs = await fetchJson<BuzzSubsResponse>(
          apiUrl(media, 'subs', { id, s: '0', e: '0', t: token }),
          { referer: playerUrl, timeoutMs: 8000 },
        );
        for (const sub of subs.subs ?? []) {
          const rawUrl = referenceUrl(sub.ref);
          if (!rawUrl) continue;
          subtitles.push({
            rawUrl,
            lang: (sub.lang ?? 'en').toLowerCase(),
            label: sub.label ?? sub.lang ?? 'en',
            headers: mediaHeaders(playerUrl),
          });
        }
      } catch {
        // subtitles are optional
      }

      if (sources.length === 0) throw new Error('2embed returned no playable source');

      return {
        sources,
        subtitles,
        diagnostics: [{ provider: '2embed', ok: true, latencyMs: Date.now() - started }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sources: [
          {
            rawUrl: embedUrl(media),
            quality: 'auto',
            codec: 'html5',
            headers: mediaHeaders(`${TWOEMBED}/`),
            adaptive: false,
          },
        ],
        subtitles: [],
        diagnostics: [
          {
            provider: '2embed',
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
