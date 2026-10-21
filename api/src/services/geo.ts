const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: GeoResult }>();

export interface GeoResult {
  country: string;
  city: string;
}

const UNKNOWN: GeoResult = { country: 'unknown', city: 'unknown' };
const LOCAL: GeoResult = { country: 'local', city: 'local' };

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isPrivate(ip: string): boolean {
  const clean = normalizeIp(ip);
  return (
    clean === '::1' ||
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean) ||
    clean.startsWith('169.254.')
  );
}

export function isLocalAddress(ip: string): boolean {
  return isPrivate(ip);
}

export async function geolocate(ip: string): Promise<GeoResult> {
  if (isPrivate(ip)) return LOCAL;

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalizeIp(ip))}?fields=status,country,city`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) throw new Error(`geo lookup failed (${res.status})`);
    const data = (await res.json()) as { status?: string; country?: string; city?: string };
    const value =
      data.status === 'success'
        ? { country: data.country ?? 'unknown', city: data.city ?? 'unknown' }
        : UNKNOWN;
    cache.set(ip, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  } catch {
    cache.set(ip, { expiresAt: Date.now() + CACHE_TTL_MS, value: UNKNOWN });
    return UNKNOWN;
  }
}
