import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Owns viewport gestures; transport and media state stay with the player. */
export function useVideoViewport({
  src,
  fit,
  disabled,
  togglePlayback,
}: {
  src: string;
  fit: boolean;
  disabled: boolean;
  togglePlayback(): Promise<void>;
}) {
  const [navigated, setNavigated] = useState(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    setNavigated(false);
    suppressClick.current = false;
    gesture.current = null;
  }, [src]);
  useEffect(() => {
    gesture.current = null;
  }, [fit]);

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointercancel') suppressClick.current = true;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = null;
  };
  return {
    navigated,
    events: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (
          event.button !== 0 ||
          (event.target instanceof Element && event.target.closest('button'))
        )
          return;
        suppressClick.current = false;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: event.currentTarget.scrollLeft,
          top: event.currentTarget.scrollTop,
        };
        if (!fit) event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (dx * dx + dy * dy < 25) return;
        suppressClick.current = true;
        if (fit) return;
        setNavigated(true);
        event.currentTarget.scrollLeft = start.left - dx;
        event.currentTarget.scrollTop = start.top - dy;
      },
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
      onScroll: () => {
        if (!fit) setNavigated(true);
      },
      onWheel: () => {
        if (!fit) setNavigated(true);
      },
      onClick: () => {
        if (!fit || disabled || suppressClick.current) return;
        void togglePlayback();
      },
    },
  };
}
