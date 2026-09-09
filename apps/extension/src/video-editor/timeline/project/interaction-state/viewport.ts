import { resolveTimelineZoomBounds } from './zoom';
import { useTimelineNavigation } from './navigation';
import type { ProjectTimelineProps } from '../types';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { clampTimelineScale } from '../../../contracts/timeline-scale';

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

function resolveTimelineFitPixelsPerSecond(
  duration: number,
  viewportWidth: number,
  fps: number
): number {
  const availableWidth = Math.max(240, viewportWidth - TIMELINE_FIT_VIEWPORT_PADDING);
  return clampTimelineScale(availableWidth / Math.max(1 / fps, duration));
}

export function useProjectTimelineViewState(
  {
    onZoomChange,
    currentTime,
    pixelsPerSecond,
    project,
  }: Pick<ProjectTimelineProps, 'onZoomChange' | 'currentTime' | 'pixelsPerSecond' | 'project'>,
  selectedClip: { startTime: number; duration: number } | null,
  viewportWidth: number,
  timelineRef: React.MutableRefObject<HTMLDivElement | null>
) {
  const minimumZoom = resolveTimelineZoomBounds({
    duration: project.duration,
    viewportWidth,
    fps: project.fps,
  }).min;
  useLayoutEffect(() => {
    if (project.duration > 0 && pixelsPerSecond < minimumZoom) onZoomChange(minimumZoom);
  }, [minimumZoom, onZoomChange, pixelsPerSecond, project.duration]);
  const navigation = useTimelineNavigation({
    extentSeconds: Math.max(project.duration + 5, 10) + 120 / pixelsPerSecond,
    pixelsPerSecond,
    viewportWidth,
    timelineRef,
  });
  const { navigateTo, readStartTime } = navigation;
  const [fitRequest, setFitRequest] = useState<{
    pixelsPerSecond: number;
    center: number | null;
    viewportX: number;
  } | null>(null);
  const fitSelectionDuration = selectedClip?.duration ?? null;
  const selectedStart = selectedClip?.startTime ?? null;
  useLayoutEffect(() => {
    if (!fitRequest || fitRequest.pixelsPerSecond !== pixelsPerSecond) return;
    navigateTo(
      fitRequest.center === null ? 0 : fitRequest.center - fitRequest.viewportX / pixelsPerSecond
    );
    setFitRequest(null);
  }, [fitRequest, pixelsPerSecond, navigateTo]);
  const requestFit = useCallback(
    (duration: number, center: number | null) => {
      const zoom = resolveTimelineFitPixelsPerSecond(duration, viewportWidth, project.fps);
      setFitRequest({ pixelsPerSecond: zoom, center, viewportX: viewportWidth / 2 });
      onZoomChange(zoom);
    },
    [onZoomChange, viewportWidth, project.fps]
  );
  const requestZoom = useCallback(
    (value: number) => {
      const zoom = Math.max(
        resolveTimelineZoomBounds({ duration: project.duration, viewportWidth, fps: project.fps })
          .min,
        clampTimelineScale(value)
      );
      const startTime = readStartTime();
      const playheadX = (currentTime - startTime) * pixelsPerSecond;
      const viewportX =
        playheadX >= 0 && playheadX <= viewportWidth ? playheadX : viewportWidth / 2;
      const center = startTime + viewportX / pixelsPerSecond;
      setFitRequest({ pixelsPerSecond: zoom, center, viewportX });
      onZoomChange(zoom);
    },
    [
      currentTime,
      onZoomChange,
      pixelsPerSecond,
      readStartTime,
      viewportWidth,
      project.duration,
      project.fps,
    ]
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
    zoomContext: { duration: project.duration, viewportWidth, fps: project.fps },
    navigateTo: navigation.navigateTo,
    projection: navigation.projection,
    readTimelineStartTime: readStartTime,
    fitSelectionDuration,
    onZoomChange: requestZoom,
    onFitProject,
    onFitSelection,
    visibleRangeSeconds: viewportWidth / clampTimelineScale(pixelsPerSecond),
  };
}
