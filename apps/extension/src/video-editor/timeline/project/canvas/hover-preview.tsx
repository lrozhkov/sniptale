import { projectTimelinePoint, type TimelineProjection } from '../interaction-state/projection';
import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { Timer } from 'lucide-react';
import { formatPreciseTime } from '../interaction-state/helpers';
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
  const [hover, setHover] = useState<{ time: number; clientX: number; clientY: number } | null>(
    null
  );

  const pointer = useRef<{ clientX: number; clientY: number } | null>(null);
  const clearHoverPreview = () => setHover(null);

  const updateHoverPreview = (event: React.PointerEvent<HTMLDivElement>) => {
    pointer.current = { clientX: event.clientX, clientY: event.clientY };
    if (!timelineRef.current || event.buttons > 0 || isTimelineObjectTarget(event.target)) {
      clearHoverPreview();
      return;
    }

    setHover({
      clientX: event.clientX,
      clientY: event.clientY,
      time: resolveTimelineTimeFromClientX(
        timelineRef.current,
        event.clientX,
        pixelsPerSecond,
        readTimelineStartTime?.()
      ),
    });
  };

  return {
    clearHoverPreview,
    hoverTime: hover?.time ?? null,
    pointer: pointer.current,
    updateHoverPreview,
  };
}

/** Advisory timing stays above lane objects and avoids the pointer inside the visible ruler. */
export function ProjectTimelineHoverPreview(props: {
  projection?: TimelineProjection | undefined;
  height: number;
  hoverTime: number | null;
  pixelsPerSecond: number;
  timelineRef?: MutableRefObject<HTMLDivElement | null>;
  pointer?: { clientX: number; clientY: number } | null | undefined;
  timingFeedback?: { time: number; beforeDuration?: number; duration?: number } | null | undefined;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 90, height: 20 });
  const time = props.timingFeedback?.time ?? props.hoverTime;
  useLayoutEffect(() => {
    const node = label.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      if (bounds.width > 0) setSize({ width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [time, props.timingFeedback]);
  if (time === null) return null;
  const left = props.projection
    ? projectTimelinePoint(props.projection, time)
    : time * props.pixelsPerSecond;
  if (left === null) return null;
  const viewport = props.timelineRef?.current;
  const start = props.projection ? 0 : (viewport?.scrollLeft ?? 0);
  const width = props.projection?.viewportWidth ?? viewport?.clientWidth ?? 900;
  if (width > 0 && (left < start || left > start + width)) return null;
  const clamp = (offset: number) =>
    Math.max(start - left, Math.min(offset, start + width - left - size.width));
  let offset = clamp(4);
  const bounds = viewport?.getBoundingClientRect();
  const pointerX =
    props.pointer && bounds ? props.pointer.clientX - bounds.left + start - left : Infinity;
  const pointerY = props.pointer && bounds ? props.pointer.clientY - bounds.top : Infinity;
  if (
    pointerY >= -16 &&
    pointerY < size.height + 16 &&
    pointerX + 28 > offset &&
    pointerX - 4 < offset + size.width
  ) {
    const before = clamp(-size.width - 8);
    offset = before + size.width <= pointerX - 8 ? before : clamp(pointerX + 32);
  }
  const feedback = props.timingFeedback;
  const delta =
    feedback?.duration !== undefined && feedback.beforeDuration !== undefined
      ? feedback.duration - feedback.beforeDuration
      : null;
  return (
    <div
      aria-hidden="true"
      data-timeline-hover-preview="true"
      data-resizing={feedback ? 'true' : undefined}
      className="pointer-events-none absolute top-0 z-[51] w-px
        bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_60%,transparent)]"
      style={{ height: props.height, left }}
    >
      <span
        ref={label}
        data-ui="video-editor.timeline.time-readout"
        className="sticky top-0 block w-max whitespace-nowrap rounded
          bg-[var(--sniptale-color-surface-panel)] px-1 text-[11px] tabular-nums
          text-[var(--sniptale-color-text-primary)] shadow-sm"
        style={{ transform: `translateX(${offset}px)` }}
      >
        {formatPreciseTime(time)}
        {feedback?.duration !== undefined && (
          <span
            className="flex items-center gap-1"
            data-ui="video-editor.timeline.duration-readout"
          >
            <Timer size={11} />
            {feedback.beforeDuration !== undefined && (
              <>{formatPreciseTime(feedback.beforeDuration)} → </>
            )}
            {formatPreciseTime(feedback.duration)}
            {delta !== null && (
              <>
                {' '}
                ({delta < 0 ? '−' : '+'}
                {formatPreciseTime(Math.abs(delta))})
              </>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function isTimelineObjectTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-timeline-object="true"]') !== null;
}
