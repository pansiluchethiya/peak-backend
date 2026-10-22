import { ProviderManager } from './index.js';
import type { Provider } from './types.js';
import { vidsrcProvider } from './vidsrc/index.js';
import { vidapiProvider } from './vidapi/index.js';
import { vidlinkProvider } from './vidlink/index.js';
import { twoEmbedProvider } from './2embed/index.js';
import { rivestreamProvider } from './rivestream/index.js';
import { vidzeeProvider } from './vidzee/index.js';
import { vixsrcProvider } from './vixsrc/index.js';
import { mappleProvider } from './mapple/index.js';
import { framextvProvider } from './framextv/index.js';
import { mcguffinProvider } from './mcguffin/index.js';
import { atlanticProvider } from './atlantic/index.js';

export function defaultProviders(): Provider[] {
  return [
    vidsrcProvider,
    vidapiProvider,
    vidlinkProvider,
    twoEmbedProvider,
    rivestreamProvider,
    vidzeeProvider,
    vixsrcProvider,
    mappleProvider,
    framextvProvider,
    mcguffinProvider,
    atlanticProvider,
  ];
}

export function defaultProviderManager(): ProviderManager {
  return new ProviderManager(defaultProviders());
}
