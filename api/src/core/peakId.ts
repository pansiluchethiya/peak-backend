// api/src/core/peakId.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SECRET = process.env.PEAK_ID_SECRET ?? process.env.PROXY_SECRET ?? 'dev-only-secret-change-me';
const KEY = createHash('sha256').update(SECRET).digest();

export type PeakKind = 'movie' | 'tv';

export function encodePeakId(kind: PeakKind, rawId: string): string {
  const plain = `${kind}:${rawId}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, tag, encrypted]);
  return `pm_${out.toString('base64url')}`;
}

export function decodePeakId(id: string): { kind: PeakKind; rawId: string } {
  if (typeof id !== 'string' || !id.startsWith('pm_')) {
    throw new Error('INVALID_ID');
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(id.slice(3), 'base64url');
  } catch {
    throw new Error('INVALID_ID');
  }
  if (buffer.length < 12 + 16 + 1) throw new Error('INVALID_ID');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const sep = plain.indexOf(':');
    if (sep <= 0) throw new Error('INVALID_ID');
    const kind = plain.slice(0, sep);
    const rawId = plain.slice(sep + 1);
    if (kind !== 'movie' && kind !== 'tv') throw new Error('INVALID_ID');
    if (!rawId || !/^[A-Za-z0-9._-]+$/.test(rawId)) throw new Error('INVALID_ID');
    return { kind: kind as PeakKind, rawId };
  } catch {
    throw new Error('INVALID_ID');
  }
}

export function encodeChannelId(name: string, url: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'channel';
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 6);
  return `channel_${slug}_${hash}`;
}
