import { isProviderEnabled, recordProviderResult } from '../services/db.js';
import type {
  AggregatedResult,
  MediaRef,
  Provider,
  ProviderDiagnostic,
  ProviderResult,
  RawSource,
  RawSubtitle,
} from './types.js';

export * from './types.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class ProviderManager {
  constructor(
    private readonly providers: Provider[],
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  list(): Provider[] {
    return [...this.providers];
  }

  async getSources(media: MediaRef): Promise<AggregatedResult> {
    const active = this.providers.filter(
      (provider) => provider.enabled !== false && isProviderEnabled(provider.id),
    );
    const timeoutMs = this.options.timeoutMs ?? 12000;

    const outcomes = await Promise.all(
      active.map(async (provider): Promise<{ provider: Provider; result?: ProviderResult; diagnostic: ProviderDiagnostic }> => {
        const started = Date.now();
        try {
          const result = await withTimeout(provider.getSources(media), timeoutMs);
          recordProviderResult(provider.id, true);
          return {
            provider,
            result,
            diagnostic: { provider: provider.id, ok: true, latencyMs: Date.now() - started },
          };
        } catch (error) {
          recordProviderResult(provider.id, false);
          return {
            provider,
            diagnostic: {
              provider: provider.id,
              ok: false,
              latencyMs: Date.now() - started,
              error: errorMessage(error),
            },
          };
        }
      }),
    );

    const sources: Array<RawSource & { provider: string }> = [];
    const subtitles: Array<RawSubtitle & { provider: string }> = [];
    const seenSources = new Set<string>();
    const seenSubtitles = new Set<string>();

    for (const { provider, result } of outcomes) {
      for (const source of result?.sources ?? []) {
        if (seenSources.has(source.rawUrl)) continue;
        seenSources.add(source.rawUrl);
        sources.push({ ...source, provider: provider.id });
      }
      for (const subtitle of result?.subtitles ?? []) {
        if (seenSubtitles.has(subtitle.rawUrl)) continue;
        seenSubtitles.add(subtitle.rawUrl);
        subtitles.push({ ...subtitle, provider: provider.id });
      }
    }

    return { sources, subtitles, diagnostics: outcomes.flatMap((outcome) => [outcome.diagnostic, ...(outcome.result?.diagnostics ?? [])]) };
  }
}
