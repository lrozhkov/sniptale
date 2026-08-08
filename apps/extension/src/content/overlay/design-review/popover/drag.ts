import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useDesignReviewPointerDrag } from '../pointer-drag';
import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';

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
  position: DesignReviewPopoverPosition,
  uiScale: number
): DesignReviewPopoverPosition {
  const rect = element?.getBoundingClientRect();
  const width = rect ? rect.width / uiScale : 480;
  const height = rect ? rect.height / uiScale : 280;
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  return {
    left: clamp(position.left, VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP),
    top: clamp(position.top, VIEWPORT_GAP, viewport.height - height - VIEWPORT_GAP),
  };
}

export function useDesignReviewPopoverDrag(args: {
  active: boolean;
  basePosition: DesignReviewPopoverPosition;
  geometryKey: number;
  popoverRef: RefObject<HTMLElement | null>;
  resetKey: Element | null;
  uiScale?: number;
}) {
  const [manualPosition, setManualPosition] = useState<DesignReviewPopoverPosition | null>(null);
  const previousResetKeyRef = useRef<Element | null>(args.resetKey);
  const position = manualPosition ?? args.basePosition;
  const { cancelPointerDrag, onPointerDown, onPointerMove, onPointerUp } =
    useDesignReviewPointerDrag({
      move: (origin, deltaX, deltaY) => {
        setManualPosition(
          clampPopoverPosition(
            args.popoverRef.current,
            {
              left: origin.left + deltaX,
              top: origin.top + deltaY,
            },
            args.uiScale ?? 1
          )
        );
      },
      position,
      ...(args.uiScale === undefined ? {} : { uiScale: args.uiScale }),
    });

  useLayoutEffect(() => {
    if (!args.active || previousResetKeyRef.current !== args.resetKey) {
      previousResetKeyRef.current = args.resetKey;
      cancelPointerDrag();
      setManualPosition(null);
    }
  }, [args.active, args.resetKey, cancelPointerDrag]);

  useLayoutEffect(() => {
    if (!args.active) return;
    const clampCurrent = () => {
      setManualPosition((current) => {
        if (!current) return current;
        const next = clampPopoverPosition(args.popoverRef.current, current, args.uiScale ?? 1);
        return next.left === current.left && next.top === current.top ? current : next;
      });
    };
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [args.active, args.geometryKey, args.popoverRef, args.uiScale]);

  return { cancelPointerDrag, onPointerDown, onPointerMove, onPointerUp, position };
}
