import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { RefObject } from 'react';
import { startWindowPointerSession } from '../../../interaction/pointer-session';

interface UseProjectTimelineSeekOptions {
  pixelsPerSecond: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  projectDuration: number;
}

export function resolveTimelineTimeFromClientX(
  timelineElement: HTMLDivElement,
  clientX: number,
  pixelsPerSecond: number
): number {
  const rect = timelineElement.getBoundingClientRect();
  const x = clientX - rect.left + timelineElement.scrollLeft;
  return Math.max(0, x / pixelsPerSecond);
}

export function resolveClampedTimelineSeekTime(
  timelineElement: HTMLDivElement,
  clientX: number,
  pixelsPerSecond: number,
  projectDuration: number
): number {
  return Math.min(
    Math.max(0, projectDuration),
    resolveTimelineTimeFromClientX(timelineElement, clientX, pixelsPerSecond)
  );
}

export function useProjectTimelineSeek({
  pixelsPerSecond,
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
          projectDuration
        )
      );
    },
    [onSeek, pixelsPerSecond, projectDuration, timelineRef]
  );

  const beginPlayheadScrub = useCallback(
    (event: ReactPointerEvent<HTMLElement>, currentTime: number, onComplete: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      cleanupRef.current?.();
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const playheadClientX = rect.left - timeline.scrollLeft + currentTime * pixelsPerSecond;
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
    [pixelsPerSecond, seekToClientX, timelineRef]
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
