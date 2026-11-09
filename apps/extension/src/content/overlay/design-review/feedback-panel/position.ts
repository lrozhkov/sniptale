import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import { useDesignReviewPointerDrag } from '../pointer-drag';
import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';

const VIEWPORT_GAP = 12;

interface PanelPosition {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampPanelPosition(
  element: HTMLElement | null,
  position: PanelPosition,
  uiScale: number
): PanelPosition {
  const width = element?.offsetWidth ?? 408;
  const height = element?.offsetHeight ?? 520;
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  return {
    x: clamp(position.x, VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP),
    y: clamp(position.y, VIEWPORT_GAP, viewport.height - height - VIEWPORT_GAP),
  };
}

/** Preview movement locally; commit a changed position only when the pointer is released. */
export function useFeedbackPanelPosition(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  uiScale = 1,
  persisted?: { position: PanelPosition; setPosition: (position: PanelPosition) => void }
) {
  const [position, setPosition] = useState<PanelPosition>(persisted?.position ?? { x: 24, y: 72 });
  const positionRef = useRef(position);
  const gestureRef = useRef<{
    pointerId: number;
    origin: PanelPosition;
  } | null>(null);
  const persistRef = useRef(persisted?.setPosition);
  persistRef.current = persisted?.setPosition;
  const updatePosition = useCallback((next: PanelPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);
  const persistedX = persisted?.position.x;
  const persistedY = persisted?.position.y;

  useLayoutEffect(() => {
    if (!open || gestureRef.current) return;
    const next = clampPanelPosition(
      panelRef.current,
      persistedX === undefined || persistedY === undefined
        ? positionRef.current
        : { x: persistedX, y: persistedY },
      uiScale
    );
    if (next.x !== positionRef.current.x || next.y !== positionRef.current.y) updatePosition(next);
  }, [open, panelRef, uiScale, persistedX, persistedY, updatePosition]);

  const drag = useDesignReviewPointerDrag({
    canStart: (event) =>
      !(event.target instanceof Element && event.target.closest('button, input, select')),
    move: (origin, deltaX, deltaY) => {
      updatePosition(
        clampPanelPosition(
          panelRef.current,
          {
            x: origin.x + deltaX,
            y: origin.y + deltaY,
          },
          uiScale
        )
      );
    },
    position,
    uiScale,
  });

  // Cancellation restores the pre-gesture position and never writes a draft to storage.
  const cancelDrag = drag.cancelPointerDrag;
  const cancelPointerDrag = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    cancelDrag();
    if (!gesture) return;
    updatePosition(clampPanelPosition(panelRef.current, gesture.origin, uiScale));
  }, [cancelDrag, panelRef, uiScale, updatePosition]);
  useLayoutEffect(() => {
    if (!open) cancelPointerDrag();
    const clampCurrent = () => {
      const next = clampPanelPosition(panelRef.current, positionRef.current, uiScale);
      updatePosition(next);
    };
    if (open) window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [open, uiScale, panelRef, updatePosition, cancelPointerDrag]);

  return {
    position,
    cancelPointerDrag,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (
        gestureRef.current ||
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest('button, input, select'))
      )
        return;
      drag.onPointerDown(event);
      gestureRef.current = {
        pointerId: event.pointerId,
        origin: positionRef.current,
      };
    },
    onPointerMove: drag.onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (gesture?.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      drag.onPointerUp(event);
      if (
        positionRef.current.x !== gesture.origin.x ||
        positionRef.current.y !== gesture.origin.y
      ) {
        persistRef.current?.(positionRef.current);
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancelPointerDrag();
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancelPointerDrag();
    },
  };
}
