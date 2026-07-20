import { useCallback, useEffect, useRef } from 'react';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';

export function useTimelinePreviewViewportReporter(params: {
  onViewportChange: (viewport: TimelinePreviewViewport) => void;
  pixelsPerSecond: number;
  timelineRef: React.MutableRefObject<HTMLDivElement | null>;
  timelineWidth: number;
}): () => void {
  const { onViewportChange, pixelsPerSecond, timelineRef, timelineWidth } = params;
  const previewViewportFrameRef = useRef(0);
  const lastPublishedViewportRef = useRef<TimelinePreviewViewport | null>(null);
  const publishPreviewViewport = useCallback(() => {
    window.cancelAnimationFrame(previewViewportFrameRef.current);
    previewViewportFrameRef.current = window.requestAnimationFrame(() => {
      const viewport = resolveTimelinePreviewViewport(timelineRef.current, pixelsPerSecond);
      if (
        lastPublishedViewportRef.current &&
        areTimelinePreviewViewportsEqual(lastPublishedViewportRef.current, viewport)
      ) {
        return;
      }
      lastPublishedViewportRef.current = viewport;
      onViewportChange(viewport);
    });
  }, [onViewportChange, pixelsPerSecond, timelineRef]);

  useEffect(() => {
    publishPreviewViewport();
    return () => window.cancelAnimationFrame(previewViewportFrameRef.current);
  }, [publishPreviewViewport, timelineWidth]);

  return publishPreviewViewport;
}

function resolveTimelinePreviewViewport(
  timelineElement: HTMLDivElement | null,
  pixelsPerSecond: number
): TimelinePreviewViewport {
  if (!timelineElement) {
    return { endTime: 0, startTime: 0 };
  }

  const pixelsPerSecondSafe = Math.max(1, pixelsPerSecond);
  const startTime = timelineElement.scrollLeft / pixelsPerSecondSafe;
  const endTime = (timelineElement.scrollLeft + timelineElement.clientWidth) / pixelsPerSecondSafe;
  return { endTime: Math.max(startTime, endTime), startTime };
}

function areTimelinePreviewViewportsEqual(
  first: TimelinePreviewViewport,
  second: TimelinePreviewViewport
): boolean {
  return first.endTime === second.endTime && first.startTime === second.startTime;
}
