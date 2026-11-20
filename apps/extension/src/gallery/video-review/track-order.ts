import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';

/** View order has no effect on composition, history, or persisted project content. */
export const REVIEW_TRACK_ORDER: readonly QuickEditTrack[] = [
  'source',
  'keyboard',
  'mouse',
  'webcam',
  'zoom',
  'cursorMotion',
  'originalAudio',
  'annotationEffects',
  'text',
  'voiceover',
  'music',
];

function moveTrack(
  order: readonly QuickEditTrack[],
  pinned: ReadonlySet<QuickEditTrack>,
  from: QuickEditTrack,
  to: QuickEditTrack
) {
  if (from === to || pinned.has(from) !== pinned.has(to)) return order;
  const next = order.filter((track) => track !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}

type Drag = {
  track: QuickEditTrack;
  before: readonly QuickEditTrack[];
  anchor: Element;
  slots: readonly { track: QuickEditTrack; center: number }[];
  slot: number;
  surface: HTMLElement | null;
  pointerId: number;
};

function trackHeaders(node: Element, order: readonly QuickEditTrack[]) {
  const viewport = node.closest('[data-ui="gallery.videoReview.trackListViewport"]');
  return [...(viewport?.querySelectorAll<HTMLElement>('[data-review-header-track]') ?? [])].flatMap(
    (header) => {
      const track = order.find((item) => item === header.dataset['reviewHeaderTrack']);
      return track ? [{ track, header }] : [];
    }
  );
}

function dragSlot(drag: Drag, clientY: number) {
  const y = clientY - drag.anchor.getBoundingClientRect().y;
  const distance = y - drag.slots[drag.slot]!.center;
  // A three-pixel dead zone absorbs hand jitter around the fixed slot boundaries.
  const biasedY = y - Math.sign(distance) * Math.min(3, Math.abs(distance));
  return drag.slots.reduce(
    (nearest, slot, index) =>
      Math.abs(biasedY - slot.center) < Math.abs(biasedY - drag.slots[nearest]!.center)
        ? index
        : nearest,
    drag.slot
  );
}

/** One disposable order receiver supports pointer preview, keyboard moves, and cancellation. */
export function useReviewTrackOrder(active: boolean) {
  const [order, setOrder] = useState(REVIEW_TRACK_ORDER);
  const [pinned, setPinned] = useState<ReadonlySet<QuickEditTrack>>(() => new Set(['source']));
  const current = useRef(order);
  const drag = useRef<Drag | null>(null);
  const update = useCallback((next: readonly QuickEditTrack[]) => {
    if (next === current.current) return;
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
      const slot = dragSlot(pending, event.clientY);
      if (slot === pending.slot) return;
      pending.slot = slot;
      update(moveTrack(pending.before, pinned, pending.track, pending.slots[slot]!.track));
    },
    [pinned, update]
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
    const node = event.currentTarget;
    const anchor = node.closest(
      '[data-review-track-group], [data-ui="gallery.videoReview.trackListViewport"]'
    );
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().y;
    const slots = trackHeaders(node, current.current)
      .filter((item) => pinned.has(item.track) === pinned.has(track))
      .map(({ track, header }) => {
        const rect = header.getBoundingClientRect();
        return { track, center: rect.y + rect.height / 2 - top };
      });
    const slot = slots.findIndex((item) => item.track === track);
    if (slot < 0) return;
    event.preventDefault();
    event.stopPropagation();
    node.focus({ preventScroll: true });
    const surface = node.closest<HTMLElement>('[data-ui="gallery.videoReview.dialog"]');
    surface?.classList.add('review-track-reordering');
    drag.current = {
      surface,
      track,
      before: current.current,
      anchor,
      slots,
      slot,
      pointerId: event.pointerId,
    };
  };
  return {
    order,
    pinned,
    togglePin(track: QuickEditTrack) {
      if (!active) return;
      finish(true);
      const nextPinned = new Set(pinned);
      if (nextPinned.has(track)) nextPinned.delete(track);
      else nextPinned.add(track);
      const next = current.current.filter((item) => item !== track);
      const firstUnpinned = next.findIndex((item) => !nextPinned.has(item));
      next.splice(firstUnpinned < 0 ? next.length : firstUnpinned, 0, track);
      setPinned(nextPinned);
      update(next);
    },
    interaction: (track: QuickEditTrack) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, track),
      onKeyDown: (event: import('react').KeyboardEvent<HTMLButtonElement>) => {
        if (!active || drag.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const visible = trackHeaders(event.currentTarget, current.current)
          .map((item) => item.track)
          .filter((item) => pinned.has(item) === pinned.has(track));
        const index = visible.indexOf(track);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : index + (event.key === 'ArrowUp' ? -1 : 1);
        const target = visible[next];
        if (target) update(moveTrack(current.current, pinned, track, target));
      },
    }),
  };
}
