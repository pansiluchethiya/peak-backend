// src/lib/provider.ts
// Registry of all stream providers (embed or scrape).
// Each provider function returns a StreamResponse for the given Media.
//
// The catalogue (order + enabled state) is fetched from the API. When a
// provider is disabled the next provider in the configured order is used
// instead, so a disabled source never breaks playback.

import type { Media, StreamResponse } from './types';
import { fetchVidapiStream } from './vidapi';
import { fetchMappleStream } from './mapple';
import { fetchVidlinkStream } from './vidlink';
import { fetch2embedStream } from './embed2';
import { fetchRivestreamStream } from './rivestream';
import { fetchVidzeeStream } from './vidzee';
import { fetchVixsrcStream } from './vixsrc';
// import { fetchHydrahdStream } from './hydrahd';
// import { fetchRidoMovieStream } from './ridomovie';
// import { fetchCineliteStream } from './cinelite';
// import { fetchFramexStream } from './framextv';
// import { fetchAtlanticStream } from './atlantic';

export const providerMap: Record<string, (media: Media) => Promise<StreamResponse>> = {
  vidapi: fetchVidapiStream,
  mapple: fetchMappleStream,
  vidlink: fetchVidlinkStream,
  '2embed': fetch2embedStream,
  rivestream: fetchRivestreamStream,
  vidzee: fetchVidzeeStream,
  vixsrc: fetchVixsrcStream,
  // hydrahd: fetchHydrahdStream,
  // ridomovie: fetchRidoMovieStream,
  // cinelite: fetchCineliteStream,
  // framextv: fetchFramexStream,
  // atlantic: fetchAtlanticStream,
};

export interface ProviderMeta {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

let catalogue: ProviderMeta[] = [];
let catalogueLoaded = false;

/** Store the provider catalogue returned by the API. */
export function setProviderCatalogue(providers: ProviderMeta[]): void {
  catalogue = [...providers].sort((a, b) => a.order - b.order);
  catalogueLoaded = true;
}

export function getProviderCatalogue(): ProviderMeta[] {
  return [...catalogue];
}

/** True when the provider is known and enabled. Unknown providers are allowed. */
export function isProviderEnabled(id: string): boolean {
  const meta = catalogue.find((provider) => provider.id === id);
  if (!meta) return true;
  return meta.enabled;
}

/**
 * Providers to try, in order. The requested provider comes first (when it is
 * enabled), followed by the remaining enabled providers in catalogue order.
 */
export function providerFallbackChain(requested?: string): string[] {
  const enabled = catalogue.filter((provider) => provider.enabled).map((provider) => provider.id);
  if (!catalogueLoaded || enabled.length === 0) {
    return requested && providerMap[requested] ? [requested] : Object.keys(providerMap);
  }
  if (!requested) return enabled;
  if (!isProviderEnabled(requested)) {
    return enabled.filter((id) => providerMap[id]);
  }
  return [requested, ...enabled.filter((id) => id !== requested && providerMap[id])];
}

/**
 * Fetch a stream from a provider. When the provider is disabled the next
 * provider in the order is tried instead.
 */
export async function fetchProviderStream(
  provider: string,
  media: Media,
): Promise<StreamResponse> {
  if (!providerMap[provider]) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const chain = providerFallbackChain(provider);
  let lastError: unknown;

  for (const id of chain) {
    const fn = providerMap[id];
    if (!fn) continue;
    try {
      const result = await fn(media);
      if (result.sources.length > 0) return result;
      lastError = new Error(`${id} returned no playable source`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No provider returned a stream');
}

/** Try every enabled provider in order until one returns a playable source. */
export async function fetchProviderChain(media: Media): Promise<StreamResponse> {
  const chain = providerFallbackChain();
  let lastError: unknown;

  for (const id of chain) {
    const fn = providerMap[id];
    if (!fn) continue;
    try {
      const result = await fn(media);
      if (result.sources.length > 0) return result;
      lastError = new Error(`${id} returned no playable source`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No provider returned a stream');
}
