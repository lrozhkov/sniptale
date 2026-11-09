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
  uiScale = 1,
  persisted?: { position: PanelPosition; setPosition: (position: PanelPosition) => void }
) {
  const [localPosition, setLocalPosition] = useState<PanelPosition>({ x: 24, y: 72 });
  const position = persisted?.position ?? localPosition;
  const persistPosition = persisted?.setPosition;
  const updatePosition = (next: PanelPosition) => {
    if (persistPosition) persistPosition(next);
    else setLocalPosition(next);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const clampCurrent = () => {
      const next = clampPanelPosition(panelRef.current, position, uiScale);
      if (next.x === position.x && next.y === position.y) return;
      if (persistPosition) persistPosition(next);
      else setLocalPosition(next);
    };
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [open, panelRef, uiScale, position, persistPosition]);

  const drag = useDesignReviewPointerDrag({
    canStart: (event) => !(event.target as Element).closest('button, input, select'),
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

  return { ...drag, position };
}
