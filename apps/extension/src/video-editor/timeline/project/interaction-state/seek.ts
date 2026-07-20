import type { RefObject } from 'react';

interface UseProjectTimelineSeekOptions {
  pixelsPerSecond: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
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

export function useProjectTimelineSeek({
  pixelsPerSecond,
  timelineRef,
  onSeek,
}: UseProjectTimelineSeekOptions) {
  const seekToClientX = (clientX: number) => {
    if (!timelineRef.current) {
      return;
    }

    onSeek(resolveTimelineTimeFromClientX(timelineRef.current, clientX, pixelsPerSecond));
  };

  const handleTimelineSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    seekToClientX(event.clientX);
  };

  return { handleTimelineSeek, seekToClientX };
}
