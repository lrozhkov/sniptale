import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';

const VIEWPORT_GAP = 12;

interface DesignReviewPopoverPosition {
  left: number;
  top: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampPopoverPosition(
  element: HTMLElement | null,
  position: DesignReviewPopoverPosition
): DesignReviewPopoverPosition {
  const rect = element?.getBoundingClientRect();
  const width = rect?.width ?? 480;
  const height = rect?.height ?? 280;
  return {
    left: clamp(position.left, VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
    top: clamp(position.top, VIEWPORT_GAP, window.innerHeight - height - VIEWPORT_GAP),
  };
}

export function useDesignReviewPopoverDrag(args: {
  active: boolean;
  basePosition: DesignReviewPopoverPosition;
  geometryKey: number;
  popoverRef: RefObject<HTMLElement | null>;
  resetKey: Element | null;
}) {
  const [manualPosition, setManualPosition] = useState<DesignReviewPopoverPosition | null>(null);
  const dragRef = useRef<{
    origin: DesignReviewPopoverPosition;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const previousResetKeyRef = useRef<Element | null>(args.resetKey);

  useLayoutEffect(() => {
    if (!args.active || previousResetKeyRef.current !== args.resetKey) {
      previousResetKeyRef.current = args.resetKey;
      dragRef.current = null;
      setManualPosition(null);
    }
  }, [args.active, args.resetKey]);

  useLayoutEffect(() => {
    if (!args.active) return;
    const clampCurrent = () => {
      setManualPosition((current) => {
        if (!current) return current;
        const next = clampPopoverPosition(args.popoverRef.current, current);
        return next.left === current.left && next.top === current.top ? current : next;
      });
    };
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [args.active, args.geometryKey, args.popoverRef]);

  const position = manualPosition ?? args.basePosition;
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        origin: position,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [position]
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setManualPosition(
        clampPopoverPosition(args.popoverRef.current, {
          left: drag.origin.left + event.clientX - drag.startX,
          top: drag.origin.top + event.clientY - drag.startY,
        })
      );
    },
    [args.popoverRef]
  );
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, position };
}
