'use client';

import { useRef } from 'react';

interface Props {
  onSingleTap: () => void;
  onDoubleTapLeft: () => void;
  onDoubleTapRight: () => void;
  children?: React.ReactNode;
}

export function MobileGestureLayer({
  onSingleTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  children,
}: Props) {
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only primary button or touch
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const isLeft = x < rect.width / 2;
    const now = Date.now();

    const timeDiff = now - lastTapRef.current.time;
    const distDiff = Math.abs(x - lastTapRef.current.x);

    if (timeDiff < 320 && distDiff < 100) {
      // Detected double-tap / double-click
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = { time: 0, x: 0 };
      if (isLeft) {
        onDoubleTapLeft();
      } else {
        onDoubleTapRight();
      }
    } else {
      lastTapRef.current = { time: now, x };
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        onSingleTap();
      }, 300);
    }
  };

  return (
    <div
      className="mobile-gesture-layer"
      onPointerDown={handlePointerDown}
      role="presentation"
    >
      {children}
    </div>
  );
}
