'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { clamp, formatTime, type BufferedRange } from '../lib/time';
import { ThumbnailPreview } from './ThumbnailPreview';

interface Props {
  currentTime: number;
  duration: number;
  bufferedRanges: BufferedRange[];
  onSeek: (time: number) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  getThumbnailUrl?: (time: number) => string | undefined;
}

export function ProgressBar({
  currentTime,
  duration,
  bufferedRanges,
  onSeek,
  onScrubbingChange,
  getThumbnailUrl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [scrubPct, setScrubPct] = useState<number | null>(null);

  const isDraggingRef = useRef(false);

  const calculatePctFromEvent = useCallback((event: ReactPointerEvent | PointerEvent): number => {
    const container = containerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const clientX = 'clientX' in event ? event.clientX : 0;
    const rawPct = (clientX - rect.left) / rect.width;
    return clamp(rawPct * 100, 0, 100);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const container = containerRef.current;
    if (!container) return;
    container.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    setIsScrubbing(true);
    onScrubbingChange?.(true);

    const pct = calculatePctFromEvent(event);
    setScrubPct(pct);
    setHoverPct(pct);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pct = calculatePctFromEvent(event);
    setHoverPct(pct);
    if (isDraggingRef.current) {
      setScrubPct(pct);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const container = containerRef.current;
    if (container && container.hasPointerCapture(event.pointerId)) {
      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer was already released
      }
    }
    isDraggingRef.current = false;
    setIsScrubbing(false);
    onScrubbingChange?.(false);

    const pct = calculatePctFromEvent(event);
    setScrubPct(null);
    if (duration > 0) {
      const targetTime = (pct / 100) * duration;
      onSeek(clamp(targetTime, 0, duration));
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      const container = containerRef.current;
      if (container && container.hasPointerCapture(event.pointerId)) {
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer was already released
        }
      }
      isDraggingRef.current = false;
      setIsScrubbing(false);
      onScrubbingChange?.(false);
      setScrubPct(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 5;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -5;
    else if (event.key === 'PageUp') delta = 30;
    else if (event.key === 'PageDown') delta = -30;
    else if (event.key === 'Home') {
      event.preventDefault();
      onSeek(0);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      onSeek(duration);
      return;
    }

    if (delta !== 0) {
      event.preventDefault();
      onSeek(clamp(currentTime + delta, 0, duration));
    }
  };

  // Safe percentage of current playback
  const playedPct = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const activePct = scrubPct !== null ? scrubPct : playedPct;
  const activeTime = duration > 0 ? (activePct / 100) * duration : 0;

  const tooltipPct = hoverPct !== null ? hoverPct : activePct;
  const tooltipTime = duration > 0 ? (tooltipPct / 100) * duration : 0;
  const thumbnailUrl = getThumbnailUrl?.(tooltipTime);

  const forceHours = duration >= 3600;
  const tooltipTimeFormatted = formatTime(tooltipTime, forceHours);

  return (
    <div
      ref={containerRef}
      className={`progress-hitbox ${isHovered || isScrubbing ? 'active' : ''}`}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => {
        setIsHovered(false);
        if (!isScrubbing) setHoverPct(null);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Seek slider"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration || 0)}
      aria-valuenow={Math.floor(activeTime)}
      aria-valuetext={formatTime(activeTime, forceHours)}
    >
      {/* Floating Tooltip with Clamped Boundary */}
      {(isHovered || isScrubbing) && duration > 0 && (
        <div
          className="progress-tooltip-anchor"
          style={{ left: `${tooltipPct}%` }}
          aria-hidden="true"
        >
          <ThumbnailPreview thumbnailUrl={thumbnailUrl} timeFormatted={tooltipTimeFormatted} />
        </div>
      )}

      {/* Visual Timeline Rail */}
      <div className="progress-rail">
        {/* Buffered Range Segments */}
        {bufferedRanges.map((range, index) => (
          <div
            key={`buffer-${index}-${range.start}`}
            className="progress-buffered-segment"
            style={{
              left: `${range.startPct}%`,
              width: `${range.widthPct}%`,
            }}
          />
        ))}

        {/* Hover / Ghost Bar */}
        {(isHovered || isScrubbing) && hoverPct !== null && (
          <div
            className="progress-hover-bar"
            style={{
              width: `${hoverPct}%`,
            }}
          />
        )}

        {/* Played Progress Bar */}
        <div
          className="progress-played-bar"
          style={{
            width: `${activePct}%`,
          }}
        />

        {/* Scrubber Thumb */}
        <div
          className="progress-scrubber-thumb"
          style={{
            left: `${activePct}%`,
          }}
        />
      </div>
    </div>
  );
}
