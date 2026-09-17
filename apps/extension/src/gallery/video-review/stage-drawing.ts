import { useEffect, useRef, useState } from 'react';
import { normalizeVideoPoint, regionFromPoints } from '../../features/video/review/geometry';
import type { ReviewRegion } from '../../features/video/review/types';

/** Annotation-region drawing: refs, escape restore, and pointer handlers live in one hook. */
export function useReviewDrawingPlane(args: {
  drawing: boolean;
  content: { x: number; y: number; width: number; height: number };
  region: ReviewRegion | undefined;
  onRegion(value: ReviewRegion): void;
  pause(): void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moving = useRef<ReviewRegion | null>(null);
  const [drag, setDrag] = useState<ReviewRegion | null>(null);
  useEffect(() => {
    if (!args.drawing) {
      start.current = null;
      moving.current = null;
      setDrag(null);
    }
  }, [args.drawing]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      start.current = null;
      moving.current = null;
      setDrag(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  const nextRegion = (end: { x: number; y: number }) => {
    if (!start.current) return null;
    const original = moving.current;
    return original
      ? {
          ...original,
          x: Math.max(0, Math.min(1 - original.width, original.x + end.x - start.current.x)),
          y: Math.max(0, Math.min(1 - original.height, original.y + end.y - start.current.y)),
        }
      : regionFromPoints(start.current, end);
  };
  const planePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  return {
    drag,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!args.drawing || event.button !== 0) return;
      start.current = normalizeVideoPoint(planePoint(event), args.content);
      moving.current = null;
      const target = event.target;
      const corner =
        target instanceof Element
          ? target.closest('[data-region-corner]')?.getAttribute('data-region-corner')
          : null;
      const point = start.current;
      if (point && args.region) {
        const region = args.region;
        if (corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se') {
          start.current = {
            x: corner.endsWith('w') ? region.x + region.width : region.x,
            y: corner.startsWith('n') ? region.y + region.height : region.y,
          };
        } else if (
          point.x >= region.x &&
          point.x <= region.x + region.width &&
          point.y >= region.y &&
          point.y <= region.y + region.height
        )
          moving.current = region;
      }
      if (start.current) {
        event.currentTarget.setPointerCapture(event.pointerId);
        args.pause();
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      const end = normalizeVideoPoint(planePoint(event), args.content, true);
      if (end) setDrag(nextRegion(end));
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      const end = normalizeVideoPoint(planePoint(event), args.content, true);
      const next = end ? nextRegion(end) : null;
      start.current = null;
      moving.current = null;
      setDrag(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (next) args.onRegion(next);
    },
    onPointerCancel: () => {
      start.current = null;
      moving.current = null;
      setDrag(null);
    },
  };
}
