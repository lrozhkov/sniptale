import type { ProjectTimelineProps } from '../types';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

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

function resolveTimelineFitPixelsPerSecond(duration: number, viewportWidth: number): number {
  const availableWidth = Math.max(240, viewportWidth - TIMELINE_FIT_VIEWPORT_PADDING);
  return clampTimelinePixelsPerSecond(availableWidth / Math.max(0.5, duration));
}

export function useProjectTimelineViewState(
  {
    onZoomChange,
    pixelsPerSecond,
    project,
  }: Pick<ProjectTimelineProps, 'onZoomChange' | 'pixelsPerSecond' | 'project'>,
  selectedClip: { startTime: number; duration: number } | null,
  viewportWidth: number,
  timelineRef: React.MutableRefObject<HTMLDivElement | null>
) {
  const [fitRequest, setFitRequest] = useState<{
    pixelsPerSecond: number;
    center: number | null;
  } | null>(null);
  const fitSelectionDuration = selectedClip?.duration ?? null;
  const selectedStart = selectedClip?.startTime ?? null;
  useLayoutEffect(() => {
    if (!fitRequest || fitRequest.pixelsPerSecond !== pixelsPerSecond) return;
    const node = timelineRef.current;
    if (node)
      node.scrollLeft =
        fitRequest.center === null
          ? 0
          : Math.max(0, fitRequest.center * pixelsPerSecond - viewportWidth / 2);
    setFitRequest(null);
  }, [fitRequest, pixelsPerSecond, timelineRef, viewportWidth]);
  const requestFit = useCallback(
    (duration: number, center: number | null) => {
      const zoom = resolveTimelineFitPixelsPerSecond(duration, viewportWidth);
      setFitRequest({ pixelsPerSecond: zoom, center });
      onZoomChange(zoom);
    },
    [onZoomChange, viewportWidth]
  );
  const onFitProject = useCallback(
    () => requestFit(project.duration, null),
    [project.duration, requestFit]
  );
  const onFitSelection = useCallback(() => {
    if (selectedStart === null || fitSelectionDuration === null) return;
    requestFit(fitSelectionDuration, selectedStart + fitSelectionDuration / 2);
  }, [fitSelectionDuration, selectedStart, requestFit]);
  return {
    fitSelectionDuration,
    onFitProject,
    onFitSelection,
    visibleRangeSeconds: viewportWidth / Math.max(1, pixelsPerSecond),
  };
}
