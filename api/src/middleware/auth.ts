import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { getDb } from '../services/db.js';

export const ADMIN_COOKIE = 'admin_token';
const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_SETTING = 'admin_password_hash';

function storedPassword(): string | null {
  try {
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(PASSWORD_SETTING) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function signingSecret(): string {
  const password = process.env.ADMIN_PASSWORD ?? '';
  const proxySecret = process.env.PROXY_SECRET ?? 'dev-only-secret-change-me';
  return createHash('sha256').update(`${password}:${proxySecret}`).digest('hex');
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) || storedPassword() !== null;
}

export function passwordMatches(candidate: string): boolean {
  const stored = storedPassword();
  if (stored) {
    const [salt, expectedHex] = stored.split(':');
    if (!salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(candidate, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function changeAdminPassword(nextPassword: string): void {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(nextPassword, salt, 32).toString('hex');
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(PASSWORD_SETTING, `${salt}:${hash}`);
}

export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, signingSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifyAdminToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, signingSecret());
    return typeof payload === 'object' && payload !== null && payload.role === 'admin';
  } catch {
    return false;
  }
}

export function adminCookie(token: string): string {
  const secure = (process.env.PUBLIC_URL ?? '').startsWith('https://') ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax${secure}`;
}

function readToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ADMIN_COOKIE) return rest.join('=');
  }
  return null;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = readToken(request);
  if (!token || !verifyAdminToken(token)) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
}
