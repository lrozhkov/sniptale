import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

type FloatingPopoverPosition = { left: number; top: number };
type DragSession = {
  origin: FloatingPopoverPosition;
  pointerId: number;
  startX: number;
  startY: number;
};

const VIEWPORT_MARGIN = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampPosition(
  element: HTMLElement | null,
  position: FloatingPopoverPosition
): FloatingPopoverPosition {
  const width = element?.offsetWidth ?? 400;
  const height = element?.offsetHeight ?? 600;
  return {
    left: clamp(position.left, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    top: clamp(position.top, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
  };
}

export function useFloatingPopoverDrag(args: {
  basePosition: FloatingPopoverPosition;
  isOpen: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
}) {
  const [manualPosition, setManualPosition] = useState<FloatingPopoverPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragSession | null>(null);

  useEffect(() => {
    dragRef.current = null;
    setIsDragging(false);
    setManualPosition(null);
  }, [args.isOpen, args.resetKey]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || (event.target as Element).closest('button')) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        origin: manualPosition ?? args.basePosition,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      setIsDragging(true);
    },
    [args.basePosition, manualPosition]
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setManualPosition(
        clampPosition(args.popoverRef.current, {
          left: drag.origin.left + event.clientX - drag.startX,
          top: drag.origin.top + event.clientY - drag.startY,
        })
      );
    },
    [args.popoverRef]
  );
  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return {
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    position: manualPosition ?? args.basePosition,
  };
}

export type FloatingPopoverDrag = ReturnType<typeof useFloatingPopoverDrag>;
