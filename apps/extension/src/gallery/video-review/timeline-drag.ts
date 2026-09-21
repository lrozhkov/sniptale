import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ReviewAnchor } from '../../features/video/review/types';

type PlaneDragProps = {
  busy?: boolean | undefined;
  gutter?: number;
  duration: number;
  time: number;
  selection: ReviewAnchor;
  onSeek(time: number, snap?: boolean): void;
  onClearSelection?(): void;
  onSelect(value: ReviewAnchor): void;
  onRangeCommit?(range: ReviewAnchor): void;
  onFocusRangeCommit?: ((range: ReviewAnchor) => void) | undefined;
};

interface PlaneDragState {
  lane: 'source' | 'focus' | 'seek';
  start: number;
  x: number;
  range: ReviewAnchor | null;
  selection: ReviewAnchor;
  time: number;
  pointerId: number;
}

type CapturedPointerDrag = {
  node: HTMLElement;
  pointerId: number;
};

/** Escape owns cancellation and pointer release for one active timeline-item drag. */
export function useReviewDragEscape<T extends CapturedPointerDrag>(
  drag: MutableRefObject<T | null>,
  resetPreview: () => void
) {
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      resetPreview();
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
}

const planeTime = (event: React.PointerEvent<HTMLDivElement>, duration: number, gutter: number) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.max(
    0,
    Math.min(
      duration,
      ((event.clientX - bounds.left - gutter) / Math.max(1, bounds.width - gutter)) * duration
    )
  );
};

/** Plane interaction state: seek, range dragging, and Escape restore; render stays separate. */
export function useReviewTimelinePlaneDrag(props: PlaneDragProps) {
  const plane = useRef<HTMLDivElement>(null);
  const drag = useRef<PlaneDragState | null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      if (plane.current?.hasPointerCapture(current.pointerId))
        plane.current.releasePointerCapture(current.pointerId);
      props.onSeek(current.time, false);
      props.onSelect(current.selection);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
  return {
    plane,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest('button,[data-ui="gallery.videoReview.trackHeader"]'))
      )
        return;
      const gutter = props.gutter ?? 0;
      if (event.clientX < event.currentTarget.getBoundingClientRect().left + gutter) return;
      const time = planeTime(event, props.duration, gutter);
      if (props.busy) {
        props.onSeek(time, false);
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const focusLane = !!target?.closest('[data-ui="gallery.videoReview.zoomLane"]');
      const audioLane = !!target?.closest('[data-ui="gallery.videoReview.audioLane"]');
      const lane = focusLane
        ? props.onFocusRangeCommit
          ? 'focus'
          : 'seek'
        : audioLane
          ? 'seek'
          : 'source';
      props.onClearSelection?.();
      drag.current = {
        lane,
        start: time,
        x: event.clientX,
        range: null,
        selection: props.selection,
        time: props.time,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      props.onSeek(time);
      if (
        lane !== 'source' ||
        props.selection.kind !== 'range' ||
        time < props.selection.start ||
        time > props.selection.end
      )
        props.onSelect({ kind: 'point', time });
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (
        !current ||
        event.pointerId !== current.pointerId ||
        current.lane === 'seek' ||
        Math.abs(event.clientX - current.x) < 4
      )
        return;
      const time = planeTime(event, props.duration, props.gutter ?? 0);
      current.range = {
        kind: 'range',
        start: Math.min(current.start, time),
        end: Math.max(current.start, time),
      };
      props.onSelect(current.range);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (!props.busy && current.range) {
        if (current.lane === 'focus') props.onFocusRangeCommit?.(current.range);
        else props.onRangeCommit?.(current.range);
      }
    },
    onPointerCancel: () => {
      const current = drag.current;
      drag.current = null;
      if (current) {
        props.onSeek(current.time, false);
        props.onSelect(current.selection);
      }
    },
  };
}
