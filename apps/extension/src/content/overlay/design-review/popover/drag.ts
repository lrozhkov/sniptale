import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useDesignReviewPointerDrag } from '../pointer-drag';

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
  const previousResetKeyRef = useRef<Element | null>(args.resetKey);
  const position = manualPosition ?? args.basePosition;
  const { cancelPointerDrag, onPointerDown, onPointerMove, onPointerUp } =
    useDesignReviewPointerDrag({
      move: (origin, deltaX, deltaY) => {
        setManualPosition(
          clampPopoverPosition(args.popoverRef.current, {
            left: origin.left + deltaX,
            top: origin.top + deltaY,
          })
        );
      },
      position,
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
        const next = clampPopoverPosition(args.popoverRef.current, current);
        return next.left === current.left && next.top === current.top ? current : next;
      });
    };
    clampCurrent();
    window.addEventListener('resize', clampCurrent);
    return () => window.removeEventListener('resize', clampCurrent);
  }, [args.active, args.geometryKey, args.popoverRef]);

  return { cancelPointerDrag, onPointerDown, onPointerMove, onPointerUp, position };
}
