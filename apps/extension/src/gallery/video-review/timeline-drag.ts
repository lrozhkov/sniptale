import type { ReviewBeforeAction } from './note-transitions';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ReviewAnchor } from '../../features/video/review/types';

type PlaneDragProps = {
  beforeAction?: ReviewBeforeAction | undefined;
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
  originalRangeTool?: boolean;
};

interface PlaneDragState {
  lane: 'source' | 'focus' | 'seek';
  start: number;
  x: number;
  range: ReviewAnchor | null;
  selection: ReviewAnchor;
  time: number;
  pointerId: number;
  admitted: boolean;
  ended: boolean;
  cancelled: boolean;
}

type CapturedPointerDrag = {
  admission?: { cancel(): void };
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
      current.admission?.cancel();
      resetPreview();
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
}

export const planeTime = (
  event: React.PointerEvent<HTMLDivElement>,
  duration: number,
  gutter: number
) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.max(
    0,
    Math.min(
      duration,
      ((event.clientX - bounds.left - gutter) / Math.max(1, bounds.width - gutter)) * duration
    )
  );
};

/** The same hit zones drive both the gesture and its cursor/hover preview. */
export function reviewPlaneLane(
  target: EventTarget | null,
  focusEnabled: boolean,
  originalEnabled: boolean
): 'source' | 'focus' | 'seek' | 'original' | 'item' | 'control' | 'gap' {
  if (!(target instanceof Element)) return 'gap';
  if (focusEnabled && target.closest('[data-ui="gallery.videoReview.editBlock"]')) return 'seek';
  if (target.closest('button,[data-ui="gallery.videoReview.trackHeader"]')) return 'control';
  if (target.closest('[data-ui="gallery.videoReview.editBlock"],[data-audio-id],[role="button"]'))
    return 'item';
  if (target.closest('[data-dragging="true"]')) return 'item';
  const audio = target.closest('[data-ui="gallery.videoReview.audioLane"]');
  if (audio)
    return originalEnabled && audio.hasAttribute('data-original-audio-lane') ? 'original' : 'seek';
  if (target.closest('[data-ui="gallery.videoReview.zoomLane"]'))
    return focusEnabled ? 'focus' : 'seek';
  if (
    target.closest(
      '[data-ui="gallery.videoReview.sourceLane"],[data-ui="gallery.videoReview.ruler"]'
    )
  )
    return focusEnabled ? 'seek' : 'source';
  return 'gap';
}

/** Plane interaction state: seek, range dragging, and Escape restore; render stays separate. */
export function useReviewTimelinePlaneDrag(props: PlaneDragProps) {
  const plane = useRef<HTMLDivElement>(null);
  const drag = useRef<PlaneDragState | null>(null);
  const commitRange = (current: PlaneDragState) => {
    if (!current.range) return;
    if (current.lane === 'focus') props.onFocusRangeCommit?.(current.range);
    else props.onRangeCommit?.(current.range);
  };
  const restore = (current: PlaneDragState) => {
    current.cancelled = true;
    if (!current.admitted) return;
    props.onSeek(current.time, false);
    props.onSelect(current.selection);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      if (plane.current?.hasPointerCapture(current.pointerId))
        plane.current.releasePointerCapture(current.pointerId);
      restore(current);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
  return {
    plane,
    activeLane: () => drag.current?.lane,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const gutter = props.gutter ?? 0;
      if (event.clientX < event.currentTarget.getBoundingClientRect().left + gutter) return;
      const hit = reviewPlaneLane(
        event.target,
        !!props.onFocusRangeCommit,
        !!props.originalRangeTool
      );
      if (hit === 'control' || hit === 'item' || hit === 'original' || hit === 'gap') return;
      const time = planeTime(event, props.duration, gutter);
      if (props.busy) {
        (props.beforeAction ?? ((action) => action()))(() => props.onSeek(time, false));
        return;
      }
      const lane = hit;
      const current: PlaneDragState = {
        lane,
        start: time,
        x: event.clientX,
        range: null,
        selection: props.selection,
        time: props.time,
        pointerId: event.pointerId,
        admitted: false,
        ended: false,
        cancelled: false,
      };
      drag.current = current;
      event.currentTarget.setPointerCapture(event.pointerId);
      (props.beforeAction ?? ((action) => action()))(() => {
        if (current.cancelled) return;
        current.admitted = true;
        props.onClearSelection?.();
        props.onSeek(time);
        if (current.range) props.onSelect(current.range);
        else if (
          lane !== 'source' ||
          props.selection.kind !== 'range' ||
          time < props.selection.start ||
          time > props.selection.end
        )
          props.onSelect({ kind: 'point', time });
        if (current.ended) commitRange(current);
      });
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
      if (current.admitted) props.onSelect(current.range);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      drag.current = null;
      current.ended = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (current.admitted) commitRange(current);
    },
    onPointerCancel: () => {
      const current = drag.current;
      drag.current = null;
      if (current) restore(current);
    },
  };
}
