import { useEffect, useState } from 'react';

import { clampTimelinePixelsPerSecond } from './zoom';

const FALLBACK_TIMELINE_VIEWPORT_WIDTH = 960;
const TIMELINE_FIT_VIEWPORT_PADDING = 96;

export function useTimelineViewportWidth(
  timelineRef: React.MutableRefObject<HTMLDivElement | null>
): number {
  const [viewportWidth, setViewportWidth] = useState(FALLBACK_TIMELINE_VIEWPORT_WIDTH);
  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const updateWidth = () =>
      setViewportWidth(node.clientWidth > 0 ? node.clientWidth : FALLBACK_TIMELINE_VIEWPORT_WIDTH);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [timelineRef]);
  return viewportWidth;
}

export function resolveTimelineFitPixelsPerSecond(duration: number, viewportWidth: number): number {
  const availableWidth = Math.max(240, viewportWidth - TIMELINE_FIT_VIEWPORT_PADDING);
  return clampTimelinePixelsPerSecond(availableWidth / Math.max(0.5, duration));
}
