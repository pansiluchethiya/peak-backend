// api/src/resolvers/liveTvResolver.ts
import { ApiError } from '../core/errors.js';
import { normalizeSource } from '../core/sources.js';
import { encodeProxyData } from '../services/proxyToken.js';
import { getChannel } from '../services/iptv/store.js';
import type { Resolver, ResolverInput, ResolvedMedia } from './types.js';

function proxyUrl(rawUrl: string, headers: Record<string, string>): string {
  const token = encodeProxyData({ url: rawUrl, headers });
  const base = process.env.PUBLIC_URL ?? '';
  return `${base.replace(/\/+$/, '')}/api/v1/proxy?data=${encodeURIComponent(token)}`;
}

export class LiveTvResolver implements Resolver {
  async resolve(input: ResolverInput): Promise<ResolvedMedia> {
    const channel = getChannel(input.id);
    if (!channel || !channel.enabled) {
      throw new ApiError('CHANNEL_NOT_FOUND', 'The requested channel could not be found.');
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const isEmbed = !/\.m3u8/i.test(channel.url);
    const source = normalizeSource(
      {
        rawUrl: channel.url,
        quality: 'auto',
        codec: isEmbed ? 'html5' : 'hls',
        headers: channel.headers,
        adaptive: !isEmbed,
        language: channel.language ?? 'und',
        provider: 'iptv',
      },
      isEmbed ? channel.url : proxyUrl(channel.url, channel.headers),
      expiresAt,
    );

    return {
      media: {
        id: channel.id,
        type: 'live_tv',
        title: channel.name,
        group: channel.groupTitle,
        logo: channel.logo,
      },
      sources: [source],
      subtitles: [],
      diagnostics: [{ provider: 'iptv', ok: true, latencyMs: 0 }],
    };
  }
}
