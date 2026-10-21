import type {
  MediaRef,
  Provider,
  ProviderDiagnostic,
  ProviderResult,
  RawSource,
  RawSubtitle,
} from '../types.js';

const DOMAINS = [
  'vidsrc.sh',
  'vidsrc2.ru',
  'vidsrc.ir',
  'vidsrc.io',
  'vidsrc.tw',
  'vsembed.ru',
] as const;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DOMAIN_TIMEOUT_MS = 8000;

interface DomainOutcome {
  sources: RawSource[];
  subtitles: RawSubtitle[];
  diagnostic: ProviderDiagnostic;
}

function embedUrl(domain: string, media: MediaRef): string {
  if (media.type === 'tv') {
    return `https://${domain}/embed/tv/${media.tmdbId}/${media.season ?? 1}/${media.episode ?? 1}`;
  }
  return `https://${domain}/embed/movie/${media.tmdbId}`;
}

function decodeHtml(html: string): string {
  return html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

function qualityOf(url: string): string {
  const match = /(2160|1440|1080|720|480|360)p/i.exec(url);
  return match ? `${match[1]}p` : 'auto';
}

function codecOf(url: string): string {
  if (/h\.?265|hevc/i.test(url)) return 'h265';
  if (/av1/i.test(url)) return 'av1';
  return 'h264';
}

function extractSources(html: string, domain: string): RawSource[] {
  const text = decodeHtml(html);
  const found = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi)) {
    found.add(match[0]);
  }
  for (const match of text.matchAll(/["'](\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/gi)) {
    found.add(new URL(match[1], `https://${domain}`).toString());
  }

  return [...found].map((rawUrl) => ({
    rawUrl,
    quality: qualityOf(rawUrl),
    codec: codecOf(rawUrl),
    headers: {
      Referer: `https://${domain}/`,
      Origin: `https://${domain}`,
      'User-Agent': USER_AGENT,
    },
  }));
}

function extractSubtitles(html: string, domain: string): RawSubtitle[] {
  const subtitles: RawSubtitle[] = [];
  for (const match of decodeHtml(html).matchAll(/<track\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const lang = /\bsrclang=["']([^"']+)["']/i.exec(tag)?.[1] ?? 'en';
    const label = /\blabel=["']([^"']+)["']/i.exec(tag)?.[1] ?? lang.toUpperCase();
    subtitles.push({
      rawUrl: new URL(src, `https://${domain}`).toString(),
      lang,
      label,
      headers: { Referer: `https://${domain}/`, 'User-Agent': USER_AGENT },
    });
  }
  return subtitles;
}

async function scrapeDomain(domain: string, media: MediaRef): Promise<DomainOutcome> {
  const started = Date.now();
  try {
    const res = await fetch(embedUrl(domain, media), {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: `https://${domain}/`,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(DOMAIN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const sources = extractSources(html, domain);
    if (sources.length === 0) throw new Error('no playable source found');

    return {
      sources,
      subtitles: extractSubtitles(html, domain),
      diagnostic: { provider: `vidsrc:${domain}`, ok: true, latencyMs: Date.now() - started },
    };
  } catch (error) {
    return {
      sources: [],
      subtitles: [],
      diagnostic: {
        provider: `vidsrc:${domain}`,
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export const vidsrcProvider: Provider = {
  id: 'vidsrc',
  name: 'VidSrc',
  enabled: true,
  async getSources(media: MediaRef): Promise<ProviderResult> {
    const outcomes = await Promise.all(DOMAINS.map((domain) => scrapeDomain(domain, media)));
    return {
      sources: outcomes.flatMap((outcome) => outcome.sources),
      subtitles: outcomes.flatMap((outcome) => outcome.subtitles),
      diagnostics: outcomes.map((outcome) => outcome.diagnostic),
    };
  },
};
