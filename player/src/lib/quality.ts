export interface NetworkInformationLike {
  downlink?: number;
  effectiveType?: string;
  saveData?: boolean;
}

export interface HlsLevelLike {
  width: number;
  height: number;
  bitrate: number;
}

/** Conservative starting estimate for HLS.js before it measures real throughput. */
export function initialBandwidthEstimate(connection?: NetworkInformationLike | null): number | undefined {
  if (!connection) return undefined;
  if (connection.saveData) return 500_000;

  switch (connection.effectiveType) {
    case 'slow-2g':
      return 200_000;
    case '2g':
      return 400_000;
    case '3g':
      return 1_200_000;
    default:
      break;
  }

  if (typeof connection.downlink === 'number' && connection.downlink > 0) {
    return Math.round(connection.downlink * 1_000_000 * 0.8);
  }
  return undefined;
}

/** Maximum height Auto is allowed to choose on constrained connections. */
export function autoQualityCap(connection?: NetworkInformationLike | null): number | null {
  if (!connection) return null;
  if (connection.saveData) return 720;

  switch (connection.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 360;
    case '3g':
      return 720;
    default:
      return null;
  }
}

/** Highest HLS level index at or below a height cap; -1 when none fit. */
export function capLevelIndex(levels: HlsLevelLike[], maxHeight: number): number {
  let best = -1;
  for (let index = 0; index < levels.length; index += 1) {
    const height = levels[index].height;
    if (height <= 0 || height > maxHeight) continue;
    if (best === -1 || height > levels[best].height) best = index;
  }
  return best;
}

export function levelLabel(level: HlsLevelLike): string {
  const width = level.width;
  if (width >= 2560) return '2160p';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  if (width >= 640) return '360p';

  const height = level.height;
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';

  return `${Math.round(level.bitrate / 1000)} kbps`;
}

/** Extracts an approximate vertical resolution number from labels like "1080p", "720p", "4k". */
export function parseQualityHeight(quality: string): number {
  const normalized = quality.trim().toLowerCase();
  if (normalized === '4k' || normalized === '2160p') return 2160;
  if (normalized === '1440p' || normalized === '2k') return 1440;
  const match = normalized.match(/^(\d{3,4})p?$/);
  if (match) {
    const height = Number.parseInt(match[1], 10);
    if (Number.isFinite(height)) return height;
  }
  return 0;
}

/**
 * Returns the preferred initial source index:
 * 1. An adaptive master source if available.
 * 2. If connection is capped, the best non-adaptive source within the cap.
 * 3. Default to the highest quality source, or index 0.
 */
export function preferredSourceIndex(
  sources: Array<{ quality: string; adaptive?: boolean }>,
  connection?: NetworkInformationLike | null,
): number {
  if (sources.length === 0) return 0;

  const adaptiveIndex = sources.findIndex((source) => source.adaptive === true);
  if (adaptiveIndex >= 0) return adaptiveIndex;

  const cap = autoQualityCap(connection);
  if (cap !== null) {
    let bestUnderCap = -1;
    let bestUnderCapHeight = -1;
    for (let index = 0; index < sources.length; index += 1) {
      const height = parseQualityHeight(sources[index].quality);
      if (height > 0 && height <= cap && height > bestUnderCapHeight) {
        bestUnderCap = index;
        bestUnderCapHeight = height;
      }
    }
    if (bestUnderCap >= 0) return bestUnderCap;
  }

  return 0;
}

/** Sorts HLS levels from highest resolution/bitrate to lowest. */
export function sortLevelsDescending<T extends HlsLevelLike>(levels: readonly T[]): T[] {
  return [...levels].sort((a, b) => {
    const heightDiff = (b.height || 0) - (a.height || 0);
    if (heightDiff !== 0) return heightDiff;
    const widthDiff = (b.width || 0) - (a.width || 0);
    if (widthDiff !== 0) return widthDiff;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
}

export function connectionHint(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return connection ?? null;
}
