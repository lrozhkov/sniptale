import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { RefObject } from 'react';
import { startWindowPointerSession } from '../../../interaction/pointer-session';

interface UseProjectTimelineSeekOptions {
  pixelsPerSecond: number;
  readTimelineStartTime?: (() => number) | undefined;
  timelineRef: RefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  projectDuration: number;
}

export function resolveTimelineTimeFromClientX(
  timelineElement: HTMLDivElement,
  clientX: number,
  pixelsPerSecond: number,
  startTime = timelineElement.scrollLeft / pixelsPerSecond
): number {
  const rect = timelineElement.getBoundingClientRect();
  const x = clientX - rect.left;
  return Math.max(0, startTime + x / pixelsPerSecond);
}

export function resolveClampedTimelineSeekTime(
  timelineElement: HTMLDivElement,
  clientX: number,
  pixelsPerSecond: number,
  projectDuration: number,
  startTime?: number
): number {
  return Math.min(
    Math.max(0, projectDuration),
    resolveTimelineTimeFromClientX(timelineElement, clientX, pixelsPerSecond, startTime)
  );
}

export function useProjectTimelineSeek({
  pixelsPerSecond,
  readTimelineStartTime,
  timelineRef,
  onSeek,
  projectDuration,
}: UseProjectTimelineSeekOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressNextClickRef = useRef(false);
  const seekToClientX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) {
        return;
      }

      onSeek(
        resolveClampedTimelineSeekTime(
          timelineRef.current,
          clientX,
          pixelsPerSecond,
          projectDuration,
          readTimelineStartTime?.()
        )
      );
    },
    [onSeek, pixelsPerSecond, projectDuration, readTimelineStartTime, timelineRef]
  );

  const beginPlayheadScrub = useCallback(
    (event: ReactPointerEvent<HTMLElement>, currentTime: number, onComplete: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      cleanupRef.current?.();
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const playheadClientX =
        rect.left +
        (currentTime - (readTimelineStartTime?.() ?? timeline.scrollLeft / pixelsPerSecond)) *
          pixelsPerSecond;
      const pointerOffset = event.clientX - playheadClientX;
      cleanupRef.current = startWindowPointerSession({
        onMove: (moveEvent) => seekToClientX(moveEvent.clientX - pointerOffset),
        onEnd: () => {
          cleanupRef.current = null;
          onComplete();
          suppressNextClickRef.current = true;
          window.setTimeout(() => {
            suppressNextClickRef.current = false;
          }, 0);
        },
      });
    },
    [pixelsPerSecond, readTimelineStartTime, seekToClientX, timelineRef]
  );
  useEffect(() => () => cleanupRef.current?.(), []);

  const handleTimelineSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    seekToClientX(event.clientX);
  };

  const consumeCompletedScrubClick = () => {
    if (!suppressNextClickRef.current) return false;
    suppressNextClickRef.current = false;
    return true;
  };

  return { beginPlayheadScrub, consumeCompletedScrubClick, handleTimelineSeek, seekToClientX };
}
