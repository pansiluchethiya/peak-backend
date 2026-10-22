// api/src/services/iptv/adapters/zlive.ts
import { parseM3u } from '../parser.js';
interface ZliveChannel {
  id: string;
  name: string;
  region?: string;
  flag?: string;
  quality?: string;
  sport?: string;
  sources?: Array<{ key: string; label: string }>;
}
export async function fetchZliveChannels(): Promise<Array<{
  name: string;
  url: string;
  tvgId: string | null;
  groupTitle: string | null;
  logo: string | null;
  language: string | null;
  country: string | null;
  headers: Record<string, string>;
  position: number;
}>> {
  const res = await fetch('https://iptv.zlive.st/channels.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`zlive channels failed: ${res.status}`);
  const data = (await res.json()) as ZliveChannel[];
  return data.map((ch, index) => ({
    name: ch.name,
    url: `https://zlive.st/watch/${ch.id}`,
    tvgId: ch.id,
    groupTitle: ch.sport || 'zlive',
    logo: null,
    language: null,
    country: ch.region || ch.flag || null,
    headers: {},
    position: index,
  }));
}
