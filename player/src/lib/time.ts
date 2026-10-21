/** Formats seconds into "m:ss", "mm:ss", or "h:mm:ss" depending on duration length. */
export function formatTime(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return forceHours ? '0:00:00' : '0:00';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0 || forceHours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export interface BufferedRange {
  start: number;
  end: number;
  startPct: number;
  widthPct: number;
}

/**
 * Converts HTMLMediaElement.buffered (TimeRanges) into an array of percentage-based ranges
 * for rendering multi-segment buffer bars.
 */
export function calculateBufferedRanges(
  buffered?: { length: number; start: (i: number) => number; end: (i: number) => number } | null,
  duration = 0,
): BufferedRange[] {
  if (!buffered || buffered.length === 0 || !Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const ranges: BufferedRange[] = [];
  for (let i = 0; i < buffered.length; i += 1) {
    const rawStart = buffered.start(i);
    const rawEnd = buffered.end(i);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) {
      continue;
    }
    const start = Math.max(0, Math.min(rawStart, duration));
    const end = Math.max(0, Math.min(rawEnd, duration));
    if (end <= start) continue;

    const startPct = Math.max(0, Math.min(100, (start / duration) * 100));
    const endPct = Math.max(0, Math.min(100, (end / duration) * 100));
    const widthPct = Math.max(0, endPct - startPct);

    if (widthPct > 0) {
      ranges.push({ start, end, startPct, widthPct });
    }
  }
  return ranges;
}

/** Clamps a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
