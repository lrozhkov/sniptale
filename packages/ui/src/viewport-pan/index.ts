import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react';
export function useViewportPanGesture<T extends HTMLElement>(viewport: RefObject<T | null>) {
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const finish = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (active && viewport.current?.hasPointerCapture(active.id))
      viewport.current.releasePointerCapture(active.id);
  }, [viewport]);
  const start = (event: PointerEvent<T>, beforeCapture?: () => void) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    beforeCapture?.();
    const node = event.currentTarget;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
    };
    node.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const move = (event: PointerEvent<T>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = active.left + active.x - event.clientX;
    event.currentTarget.scrollTop = active.top + active.y - event.clientY;
  };
  const end = (event: PointerEvent<T>) => {
    if (gesture.current?.id === event.pointerId) finish();
  };
  return { dragging, finish, start, move, end };
}
