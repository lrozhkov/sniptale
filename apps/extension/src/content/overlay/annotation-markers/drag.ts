import { useRef, type PointerEvent } from 'react';
import { clampMarkerOffset, type AnnotationMarkerOffset } from './position';

export function useAnnotationMarkerDrag(args: {
  offset: AnnotationMarkerOffset;
  onChange: (offset: AnnotationMarkerOffset) => void;
  target: Element;
}) {
  const dragRef = useRef<{
    offset: AnnotationMarkerOffset;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        offset: args.offset,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      args.onChange(
        clampMarkerOffset(args.target, {
          x: drag.offset.x + event.clientX - drag.x,
          y: drag.offset.y + event.clientY - drag.y,
        })
      );
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
  };
}
