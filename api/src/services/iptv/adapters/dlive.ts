// api/src/services/iptv/adapters/dlive.ts
export async function resolveDliveChannel(channelId: string): Promise<{
  name: string;
  url: string;
  headers: Record<string, string>;
}> {
  // 1. Fetch the daddy.php page to discover the edge host and channel slug.
  const pageUrl = `https://dembed.st/premiumtv/daddy.php?id=${encodeURIComponent(channelId)}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      Referer: 'https://dlive.sx/',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!pageRes.ok) throw new Error(`dlive daddy page failed: ${pageRes.status}`);
  const html = await pageRes.text();
  const edgeMatch = /const EDGE = "(https:\/\/[^"]+)"/.exec(html);
  const channelMatch = /const CHANNEL = "([^"]+)"/.exec(html);
  const slugMatch = /const SRC = "[^"]*\/([^/]+)\/index\.m3u8"/.exec(html);
  const edge = edgeMatch?.[1];
  const channel = channelMatch?.[1] ?? channelId;
  const slug = slugMatch?.[1] ?? `premium${channelId}`;
  if (!edge) throw new Error('dlive daddy page had no edge host');
  // 2. Get a playlist token.
  const tokenRes = await fetch(`${edge}/api/playlist-token?slug=${encodeURIComponent(channel)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      Referer: pageUrl,
      Origin: 'https://dembed.st',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenRes.ok) throw new Error(`dlive token failed: ${tokenRes.status}`);
  const tokenData = (await tokenRes.json()) as { token?: string };
  if (!tokenData.token) throw new Error('dlive returned no token');
  // 3. Build the playlist URL.
  const url = `${edge}/${slug}/index.m3u8?t=${encodeURIComponent(tokenData.token)}`;
  return {
    name: `Dlive ${channelId}`,
    url,
    headers: {
      Referer: pageUrl,
      Origin: 'https://dembed.st',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    },
  };
}
