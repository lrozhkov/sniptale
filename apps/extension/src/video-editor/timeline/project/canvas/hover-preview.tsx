import { projectTimelinePoint, type TimelineProjection } from '../interaction-state/projection';
import { useState, type MutableRefObject } from 'react';
import { resolveTimelineTimeFromClientX } from '../interaction-state/seek';

export const TIMELINE_OBJECT_MARKER_PROPS = {
  'data-timeline-object': 'true',
} as const;

export function useTimelineHoverPreview({
  pixelsPerSecond,
  readTimelineStartTime,
  timelineRef,
}: {
  pixelsPerSecond: number;
  readTimelineStartTime?: (() => number) | undefined;
  timelineRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const clearHoverPreview = () => setHoverTime(null);

  const updateHoverPreview = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current || isTimelineObjectTarget(event.target)) {
      clearHoverPreview();
      return;
    }

    setHoverTime(
      resolveTimelineTimeFromClientX(
        timelineRef.current,
        event.clientX,
        pixelsPerSecond,
        readTimelineStartTime?.()
      )
    );
  };

  return {
    clearHoverPreview,
    hoverTime,
    updateHoverPreview,
  };
}

export function ProjectTimelineHoverPreview(props: {
  projection?: TimelineProjection | undefined;
  height: number;
  hoverTime: number | null;
  pixelsPerSecond: number;
}) {
  if (props.hoverTime === null) {
    return null;
  }

  const left = props.projection
    ? projectTimelinePoint(props.projection, props.hoverTime)
    : props.hoverTime * props.pixelsPerSecond;
  if (left === null) return null;
  return (
    <div
      aria-hidden="true"
      data-timeline-hover-preview="true"
      className={[
        'pointer-events-none absolute top-0 z-20 w-px',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_34%,transparent)]',
      ].join(' ')}
      style={{ height: props.height, left }}
    />
  );
}

function isTimelineObjectTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-timeline-object="true"]') !== null;
}
