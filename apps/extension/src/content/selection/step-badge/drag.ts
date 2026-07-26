import React from 'react';
import type {
  StepBadgeBoundarySide,
  StepBadgeManualPlacement,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { projectStepBadgeToFrameBoundary, type StepBadgeFrameRect } from './placement';

function getKeyboardPlacement(args: {
  event: React.KeyboardEvent<HTMLButtonElement>;
  frameRect: StepBadgeFrameRect;
  placement: StepBadgeManualPlacement;
}): StepBadgeManualPlacement | null {
  const step = args.event.shiftKey ? 10 : 1;
  const horizontal = args.placement.side === 'top' || args.placement.side === 'bottom';
  const axisSize = Math.max(1, horizontal ? args.frameRect.width : args.frameRect.height);
  let direction = 0;
  if (horizontal && args.event.key === 'ArrowLeft') direction = -1;
  if (horizontal && args.event.key === 'ArrowRight') direction = 1;
  if (!horizontal && args.event.key === 'ArrowUp') direction = -1;
  if (!horizontal && args.event.key === 'ArrowDown') direction = 1;
  if (direction === 0) return null;
  return {
    ...args.placement,
    position: Math.max(0, Math.min(1, args.placement.position + (direction * step) / axisSize)),
  };
}

function areStepBadgePlacementsEqual(
  left: StepBadgeManualPlacement,
  right: StepBadgeManualPlacement
): boolean {
  return left.position === right.position && left.side === right.side;
}

export function useStepBadgeBoundaryDrag(args: {
  frameRect: StepBadgeFrameRect;
  initialPlacement: StepBadgeManualPlacement;
  onPositionChange: (placement: StepBadgeManualPlacement) => void;
}) {
  const [draftPlacement, setDraftPlacement] = React.useState<StepBadgeManualPlacement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftRef = React.useRef<StepBadgeManualPlacement | null>(null);
  const previousSideRef = React.useRef<StepBadgeBoundarySide>(args.initialPlacement.side);
  const observedPlacementRef = React.useRef(args.initialPlacement);

  React.useEffect(() => {
    const propChanged = !areStepBadgePlacementsEqual(
      observedPlacementRef.current,
      args.initialPlacement
    );
    observedPlacementRef.current = args.initialPlacement;
    if (isDragging || !draftRef.current || !propChanged) return;
    draftRef.current = null;
    setDraftPlacement(null);
  }, [args.initialPlacement, isDragging]);

  const cancel = React.useCallback(() => {
    if (pointerIdRef.current === null) return false;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraftPlacement(null);
    setIsDragging(false);
    return true;
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const placement = projectStepBadgeToFrameBoundary({
        frameRect: args.frameRect,
        point: { x: event.clientX, y: event.clientY },
        previousSide: previousSideRef.current,
      });
      previousSideRef.current = placement.side;
      draftRef.current = placement;
      setDraftPlacement(placement);
    };
    const handleUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const placement = draftRef.current;
      pointerIdRef.current = null;
      setIsDragging(false);
      if (!placement) return;
      if (areStepBadgePlacementsEqual(placement, args.initialPlacement)) {
        draftRef.current = null;
        setDraftPlacement(null);
      }
      args.onPositionChange(placement);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !cancel()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('pointermove', handleMove, { capture: true });
    document.addEventListener('pointerup', handleUp, { capture: true });
    document.addEventListener('pointercancel', cancel, { capture: true });
    document.addEventListener('lostpointercapture', cancel, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('blur', cancel);
    return () => {
      document.removeEventListener('pointermove', handleMove, { capture: true });
      document.removeEventListener('pointerup', handleUp, { capture: true });
      document.removeEventListener('pointercancel', cancel, { capture: true });
      document.removeEventListener('lostpointercapture', cancel, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('blur', cancel);
    };
  }, [args, cancel, isDragging]);

  return {
    draftPlacement,
    isDragging,
    handlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The transient portal can disappear while capture is being requested.
      }
      pointerIdRef.current = event.pointerId;
      previousSideRef.current = args.initialPlacement.side;
      draftRef.current = args.initialPlacement;
      setIsDragging(true);
    },
    handleKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const placement = getKeyboardPlacement({
        event,
        frameRect: args.frameRect,
        placement: args.initialPlacement,
      });
      if (!placement) return;
      event.preventDefault();
      event.stopPropagation();
      args.onPositionChange(placement);
    },
  };
}
