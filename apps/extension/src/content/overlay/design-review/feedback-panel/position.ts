import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';

const VIEWPORT_GAP = 12;

interface PanelPosition {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampPanelPosition(element: HTMLElement | null, position: PanelPosition): PanelPosition {
  const rect = element?.getBoundingClientRect();
  const width = rect?.width ?? 408;
  const height = rect?.height ?? 520;
  return {
    x: clamp(position.x, VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
    y: clamp(position.y, VIEWPORT_GAP, window.innerHeight - height - VIEWPORT_GAP),
  };
}

export function useFeedbackPanelPosition(panelRef: RefObject<HTMLElement | null>, open: boolean) {
  const [position, setPosition] = useState<PanelPosition>({ x: 24, y: 72 });
  const dragRef = useRef<{
    origin: PanelPosition;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const clampCurrent = () =>
      setPosition((current) => {
        const next = clampPanelPosition(panelRef.current, current);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [open, panelRef]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as Element).closest('button, input, select')) {
        return;
      }
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
      setPosition(
        clampPanelPosition(panelRef.current, {
          x: drag.origin.x + event.clientX - drag.startX,
          y: drag.origin.y + event.clientY - drag.startY,
        })
      );
    },
    [panelRef]
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, position };
}
