import type { Fingerprint } from './types';

const STORAGE_KEY = 'peakmovies:fp';

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function digest(input: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const data = new TextEncoder().encode(input);
      const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24);
    }
  } catch {
    // Fall through to the non-crypto hash when SubtleCrypto is unavailable.
  }
  return simpleHash(input);
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 40;
    const context = canvas.getContext('2d');
    if (!context) return 'no-canvas';
    context.textBaseline = 'top';
    context.font = '14px Arial';
    context.fillStyle = '#6366f1';
    context.fillRect(0, 0, 160, 40);
    context.fillStyle = '#ffffff';
    context.fillText('PeakMovies fingerprint', 4, 8);
    return canvas.toDataURL();
  } catch {
    return 'canvas-blocked';
  }
}

export async function getFingerprint(): Promise<Fingerprint> {
  if (typeof window === 'undefined') {
    return {
      hash: 'server',
      userAgent: 'server',
      screen: 'server',
      timezone: 'server',
      language: 'server',
    };
  }

  const cached = sessionStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as Fingerprint;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  const payload = {
    userAgent: navigator.userAgent,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown',
    language: navigator.language,
    canvas: canvasSignature(),
  };

  const fingerprint: Fingerprint = {
    hash: await digest(JSON.stringify(payload)),
    userAgent: payload.userAgent,
    screen: payload.screen,
    timezone: payload.timezone,
    language: payload.language,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fingerprint));
  } catch {
    // Private browsing can block storage; the fingerprint still works for this load.
  }

  return fingerprint;
}
