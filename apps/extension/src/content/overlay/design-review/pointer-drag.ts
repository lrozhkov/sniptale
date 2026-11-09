import { useCallback, useLayoutEffect, useRef, type PointerEvent } from 'react';

type PointerDragSession<TPosition> = {
  origin: TPosition;
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
};

export function useDesignReviewPointerDrag<TPosition>(args: {
  canStart?(event: PointerEvent<HTMLElement>): boolean;
  move(origin: TPosition, deltaX: number, deltaY: number): void;
  position: TPosition;
  uiScale?: number;
}) {
  const dragRef = useRef<PointerDragSession<TPosition> | null>(null);
  const cancelPointerDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.target.hasPointerCapture?.(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
  }, []);
  useLayoutEffect(() => cancelPointerDrag, [cancelPointerDrag]);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || args.canStart?.(event) === false) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        origin: args.position,
        pointerId: event.pointerId,
        target: event.currentTarget,
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
      const uiScale = args.uiScale ?? 1;
      args.move(
        drag.origin,
        (event.clientX - drag.startX) / uiScale,
        (event.clientY - drag.startY) / uiScale
      );
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
