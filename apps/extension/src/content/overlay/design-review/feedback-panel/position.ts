import { useLayoutEffect, useState, type RefObject } from 'react';
import { useDesignReviewPointerDrag } from '../pointer-drag';

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

  const drag = useDesignReviewPointerDrag({
    canStart: (event) => !(event.target as Element).closest('button, input, select'),
    move: (origin, deltaX, deltaY) => {
      setPosition(
        clampPanelPosition(panelRef.current, {
          x: origin.x + deltaX,
          y: origin.y + deltaY,
        })
      );
    },
    position,
  });

  return { ...drag, position };
}
