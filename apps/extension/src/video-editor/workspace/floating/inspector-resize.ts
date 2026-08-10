import { useCallback, useEffect, useRef, useState } from 'react';
import { startWindowPointerSession } from '../../interaction/pointer-session';

export const INSPECTOR_MIN_WIDTH = 280;
export const INSPECTOR_MAX_WIDTH = 520;
const INSPECTOR_DEFAULT_WIDTH = 320;
const INSPECTOR_KEYBOARD_STEP = 24;

export function clampInspectorWidth(width: number): number {
  const viewportMaximum =
    typeof window === 'undefined'
      ? INSPECTOR_MAX_WIDTH
      : Math.max(INSPECTOR_MIN_WIDTH, window.innerWidth - 96);
  return Math.min(
    Math.max(width, INSPECTOR_MIN_WIDTH),
    Math.min(INSPECTOR_MAX_WIDTH, viewportMaximum)
  );
}

export function useInspectorResize() {
  const [width, setWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      cleanupRef.current?.();
      const startX = event.clientX;
      const startWidth = width;
      cleanupRef.current = startWindowPointerSession({
        onMove: (moveEvent) =>
          setWidth(clampInspectorWidth(startWidth + startX - moveEvent.clientX)),
        onEnd: () => {
          cleanupRef.current = null;
        },
      });
    },
    [width]
  );

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? 1 : -1;
    setWidth((current) => clampInspectorWidth(current + direction * INSPECTOR_KEYBOARD_STEP));
  }, []);

  return { onKeyDown, onPointerDown, width };
}
