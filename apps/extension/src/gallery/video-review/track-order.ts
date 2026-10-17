import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';

/** View order has no effect on composition, history, or persisted project content. */
export const REVIEW_TRACK_ORDER: readonly QuickEditTrack[] = [
  'actions',
  'source',
  'webcam',
  'zoom',
  'originalAudio',
  'annotationEffects',
  'text',
  'voiceover',
  'music',
];

function moveTrack(order: readonly QuickEditTrack[], from: QuickEditTrack, to: QuickEditTrack) {
  const next = order.filter((track) => track !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}

type Drag = {
  track: QuickEditTrack;
  before: readonly QuickEditTrack[];
  node: HTMLButtonElement;
  surface: HTMLElement | null;
  pointerId: number;
};

/** One disposable order receiver supports pointer preview, keyboard moves, and cancellation. */
export function useReviewTrackOrder(active: boolean) {
  const [order, setOrder] = useState(REVIEW_TRACK_ORDER);
  const current = useRef(order);
  const drag = useRef<Drag | null>(null);
  const update = useCallback((next: readonly QuickEditTrack[]) => {
    current.current = next;
    setOrder(next);
  }, []);
  const finish = useCallback(
    (cancel: boolean) => {
      const pending = drag.current;
      drag.current = null;
      if (!pending) return;
      pending.surface?.classList.remove('review-track-reordering');
      if (cancel) update(pending.before);
    },
    [update]
  );
  useEffect(() => {
    if (!active) finish(true);
  }, [active, finish]);
  const move = useCallback(
    (event: globalThis.PointerEvent) => {
      const pending = drag.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const list = pending.node.closest('[data-ui="gallery.videoReview.trackListViewport"]');
      const headers = [
        ...(list?.querySelectorAll<HTMLElement>('[data-review-header-track]') ?? []),
      ];
      const target = headers.reduce<HTMLElement | null>((nearest, row) => {
        const distance = (node: HTMLElement) => {
          const box = node.getBoundingClientRect();
          return Math.abs(event.clientY - box.y - box.height / 2);
        };
        return !nearest || distance(row) < distance(nearest) ? row : nearest;
      }, null)?.dataset['reviewHeaderTrack'] as QuickEditTrack | undefined;
      if (target && target !== pending.track)
        update(moveTrack(current.current, pending.track, target));
    },
    [update]
  );
  useEffect(() => {
    const cancel = () => finish(true);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(true);
    };
    const end = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) finish(false);
    };
    const abort = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) finish(true);
    };
    // Portaled headers move in the DOM. Window listeners retain the gesture across that move.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    return () => {
      drag.current?.surface?.classList.remove('review-track-reordering');
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
    };
  }, [finish, move]);
  const start = (event: PointerEvent<HTMLButtonElement>, track: QuickEditTrack) => {
    if (!active || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    const surface = event.currentTarget.closest<HTMLElement>(
      '[data-ui="gallery.videoReview.dialog"]'
    );
    surface?.classList.add('review-track-reordering');
    drag.current = {
      surface,
      track,
      before: current.current,
      node: event.currentTarget,
      pointerId: event.pointerId,
    };
  };
  return {
    order,
    interaction: (track: QuickEditTrack) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, track),
      onKeyDown: (event: import('react').KeyboardEvent<HTMLButtonElement>) => {
        if (!active || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const list = event.currentTarget.closest(
          '[data-ui="gallery.videoReview.trackListViewport"]'
        );
        const visible = [
          ...(list?.querySelectorAll<HTMLElement>('[data-review-header-track]') ?? []),
        ].map((node) => node.dataset['reviewHeaderTrack'] as QuickEditTrack);
        const index = visible.indexOf(track);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : index + (event.key === 'ArrowUp' ? -1 : 1);
        const target = visible[next];
        if (target) update(moveTrack(current.current, track, target));
      },
    }),
  };
}
