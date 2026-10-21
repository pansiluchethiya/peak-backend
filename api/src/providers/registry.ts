import { ProviderManager } from './index.js';
import type { Provider } from './types.js';
import { vidsrcProvider } from './vidsrc/index.js';
import { vidapiProvider } from './vidapi/index.js';

export function defaultProviders(): Provider[] {
  return [vidsrcProvider, vidapiProvider];
}

export function defaultProviderManager(): ProviderManager {
  return new ProviderManager(defaultProviders());
}
