import { useCallback, useRef, type PointerEvent } from 'react';

type PointerDragSession<TPosition> = {
  origin: TPosition;
  pointerId: number;
  startX: number;
  startY: number;
};

export function useDesignReviewPointerDrag<TPosition>(args: {
  canStart?(event: PointerEvent<HTMLElement>): boolean;
  move(origin: TPosition, deltaX: number, deltaY: number): void;
  position: TPosition;
}) {
  const dragRef = useRef<PointerDragSession<TPosition> | null>(null);
  const cancelPointerDrag = useCallback(() => {
    dragRef.current = null;
  }, []);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || args.canStart?.(event) === false) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        origin: args.position,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [args]
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      args.move(drag.origin, event.clientX - drag.startX, event.clientY - drag.startY);
    },
    [args]
  );
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  return { cancelPointerDrag, onPointerDown, onPointerMove, onPointerUp };
}
