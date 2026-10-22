import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Provider } from './types.js';

export const PROVIDERS_ORDER_FILE = 'providersOrder.json';

/** Absolute path of the provider order file (shared with the admin UI). */
export function providersOrderPath(): string {
  const configured = process.env.PROVIDERS_ORDER_FILE;
  if (configured && configured.trim()) return resolve(configured.trim());
  return resolve(process.cwd(), PROVIDERS_ORDER_FILE);
}

/** Read the persisted provider order. Returns an empty list when unavailable. */
export function loadProviderOrder(filePath: string = providersOrderPath()): string[] {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

/** Persist the provider order. */
export function saveProviderOrder(order: string[], filePath: string = providersOrderPath()): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(order, null, 2)}\n`, 'utf8');
}

/**
 * Sort providers by the persisted order. Providers that are not part of the
 * order file keep their registry position and are appended at the end.
 */
export function applyProviderOrder(providers: Provider[], order: string[]): Provider[] {
  if (order.length === 0) return [...providers];

  const remaining = new Map(providers.map((provider) => [provider.id, provider]));
  const sorted: Provider[] = [];

  for (const id of order) {
    const provider = remaining.get(id);
    if (!provider) continue;
    sorted.push(provider);
    remaining.delete(id);
  }

  for (const provider of providers) {
    if (remaining.has(provider.id)) sorted.push(provider);
  }

  return sorted;
}
