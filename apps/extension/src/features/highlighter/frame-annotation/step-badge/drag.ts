import React from 'react';
import {
  acceptPointerDragEvent,
  commitPointerDragDraft,
  registerPointerDragSession,
} from '../interaction/pointer-drag-session';
import type {
  StepBadgeBoundarySide,
  StepBadgeManualPlacement,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { STEP_BADGE_NORMAL_OFFSET_LIMIT } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  getStepBadgeBoundaryCenter,
  projectStepBadgeToFrameBoundary,
  type StepBadgeFrameRect,
} from './placement';
import {
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

function getKeyboardPlacement(args: {
  event: React.KeyboardEvent<HTMLButtonElement>;
  frameRect: StepBadgeFrameRect;
  placement: StepBadgeManualPlacement;
}): StepBadgeManualPlacement | null {
  const step = args.event.shiftKey ? 10 : 1;
  const horizontal = args.placement.side === 'top' || args.placement.side === 'bottom';
  const axisSize = Math.max(1, horizontal ? args.frameRect.width : args.frameRect.height);
  const alongDirection = horizontal
    ? args.event.key === 'ArrowLeft'
      ? -1
      : args.event.key === 'ArrowRight'
        ? 1
        : 0
    : args.event.key === 'ArrowUp'
      ? -1
      : args.event.key === 'ArrowDown'
        ? 1
        : 0;
  if (alongDirection !== 0) {
    return {
      ...args.placement,
      position: Math.max(
        0,
        Math.min(1, args.placement.position + (alongDirection * step) / axisSize)
      ),
    };
  }
  const outwardKey =
    args.placement.side === 'top'
      ? 'ArrowUp'
      : args.placement.side === 'right'
        ? 'ArrowRight'
        : args.placement.side === 'bottom'
          ? 'ArrowDown'
          : 'ArrowLeft';
  const inwardKey =
    args.placement.side === 'top'
      ? 'ArrowDown'
      : args.placement.side === 'right'
        ? 'ArrowLeft'
        : args.placement.side === 'bottom'
          ? 'ArrowUp'
          : 'ArrowRight';
  const normalDirection = args.event.key === outwardKey ? 1 : args.event.key === inwardKey ? -1 : 0;
  if (normalDirection === 0) return null;
  const normalOffset = Math.max(
    -STEP_BADGE_NORMAL_OFFSET_LIMIT,
    Math.min(
      STEP_BADGE_NORMAL_OFFSET_LIMIT,
      (args.placement.normalOffset ?? 0) + normalDirection * step
    )
  );
  if (normalOffset !== 0) return { ...args.placement, normalOffset };
  const { normalOffset: _normalOffset, ...placementWithoutOffset } = args.placement;
  return placementWithoutOffset;
}

function areStepBadgePlacementsEqual(
  left: StepBadgeManualPlacement,
  right: StepBadgeManualPlacement
): boolean {
  return (
    left.position === right.position &&
    left.side === right.side &&
    (left.normalOffset ?? 0) === (right.normalOffset ?? 0)
  );
}

export function useStepBadgeBoundaryDrag(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  frameRect: StepBadgeFrameRect;
  initialPlacement: StepBadgeManualPlacement;
  onPositionChange: (placement: StepBadgeManualPlacement) => void;
  visualOffset: { x: number; y: number };
  visualScale?: number;
}) {
  const [draftPlacement, setDraftPlacement] = React.useState<StepBadgeManualPlacement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const pointerGrabOffsetRef = React.useRef({ x: 0, y: 0 });
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
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const coordinateSpace = args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
      const point = coordinateSpace.clientPointToLogical({ x: event.clientX, y: event.clientY });
      const placement = projectStepBadgeToFrameBoundary({
        frameRect: args.frameRect,
        point: {
          x:
            point.x -
            pointerGrabOffsetRef.current.x -
            args.visualOffset.x * (args.visualScale ?? 1),
          y:
            point.y -
            pointerGrabOffsetRef.current.y -
            args.visualOffset.y * (args.visualScale ?? 1),
        },
        previousSide: previousSideRef.current,
      });
      previousSideRef.current = placement.side;
      draftRef.current = placement;
      setDraftPlacement(placement);
    };
    const handleUp = (event: PointerEvent) => {
      commitPointerDragDraft({
        draftRef,
        event,
        initialValue: args.initialPlacement,
        isEqual: (left, right) => Boolean(right && areStepBadgePlacementsEqual(left, right)),
        onClear: () => setDraftPlacement(null),
        onCommit: args.onPositionChange,
        onFinish: () => setIsDragging(false),
        pointerIdRef,
      });
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
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
      const coordinateSpace = args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
      const pointer = coordinateSpace.clientPointToLogical({
        x: event.clientX,
        y: event.clientY,
      });
      const boundaryCenter = getStepBadgeBoundaryCenter(args.frameRect, args.initialPlacement);
      const visualScale = args.visualScale ?? 1;
      pointerGrabOffsetRef.current = {
        x: pointer.x - (boundaryCenter.x + args.visualOffset.x * visualScale),
        y: pointer.y - (boundaryCenter.y + args.visualOffset.y * visualScale),
      };
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
