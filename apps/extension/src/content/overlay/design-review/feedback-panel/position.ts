import { useLayoutEffect, useState, type RefObject } from 'react';
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

export function useFeedbackPanelPosition(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  uiScale = 1
) {
  const [position, setPosition] = useState<PanelPosition>({ x: 24, y: 72 });

  useLayoutEffect(() => {
    if (!open) return;
    const clampCurrent = () =>
      setPosition((current) => {
        const next = clampPanelPosition(panelRef.current, current, uiScale);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [open, panelRef, uiScale]);

  const drag = useDesignReviewPointerDrag({
    canStart: (event) => !(event.target as Element).closest('button, input, select'),
    move: (origin, deltaX, deltaY) => {
      setPosition(
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

  return { ...drag, position };
}
