import React from 'react';
import type { CalloutPoint } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  acceptPointerDragEvent,
  finishPointerDragEvent,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../interaction/pointer-drag-session';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';
import {
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

type Point = { x: number; y: number };

function clampHandleOffset(offset: CalloutPoint, maximumDistance: number) {
  const distance = Math.hypot(offset.x, offset.y);
  if (distance <= maximumDistance || distance === 0) return offset;
  const scale = maximumDistance / distance;
  return { x: offset.x * scale, y: offset.y * scale };
}

export function useCalloutCurveHandleDrag(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  defaultPoint: Point | null;
  isEditing: boolean;
  maximumDistance: number;
  onChange: (offset: CalloutPoint) => void;
  origin: Point | null;
  storedOffset: CalloutPoint | undefined;
  visualScale?: number;
}) {
  const [draftOffset, setDraftOffset] = React.useState<CalloutPoint | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const draftRef = React.useRef<CalloutPoint | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (
      !isDragging &&
      draftOffset &&
      args.storedOffset?.x === draftOffset.x &&
      args.storedOffset.y === draftOffset.y
    ) {
      setDraftOffset(null);
    }
  }, [args.storedOffset, draftOffset, isDragging]);

  const cancel = React.useCallback(() => {
    if (!isDragging) return false;
    draftRef.current = null;
    pointerIdRef.current = null;
    setDraftOffset(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    if (!isDragging || !args.origin) return;
    const move = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const point = (
        args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace
      ).clientPointToLogical({ x: event.clientX, y: event.clientY });
      const offset = clampHandleOffset(
        {
          x: (point.x - args.origin!.x) / (args.visualScale ?? 1),
          y: (point.y - args.origin!.y) / (args.visualScale ?? 1),
        },
        args.maximumDistance
      );
      draftRef.current = offset;
      setDraftOffset(offset);
    };
    const up = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, pointerIdRef, () => setIsDragging(false))) return;
      const offset = draftRef.current;
      draftRef.current = null;
      if (offset) args.onChange(offset);
    };
    return registerPointerDragSession({ cancel, move, up });
  }, [args, cancel, isDragging]);

  return {
    draftOffset,
    isDragging,
    handlePointerDown: (event: PointerDragStartEvent) => {
      if (args.isEditing || !args.origin || !args.defaultPoint || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      pointerIdRef.current = event.pointerId;
      draftRef.current = args.storedOffset ?? {
        x: (args.defaultPoint.x - args.origin.x) / (args.visualScale ?? 1),
        y: (args.defaultPoint.y - args.origin.y) / (args.visualScale ?? 1),
      };
      setIsDragging(true);
    },
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => {
      if (args.isEditing || !args.origin || !args.defaultPoint) return;
      const delta = getCalloutKeyboardDelta(event);
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const current = args.storedOffset ?? {
        x: (args.defaultPoint.x - args.origin.x) / (args.visualScale ?? 1),
        y: (args.defaultPoint.y - args.origin.y) / (args.visualScale ?? 1),
      };
      const next = clampHandleOffset(
        { x: current.x + delta.x, y: current.y + delta.y },
        args.maximumDistance
      );
      setDraftOffset(next);
      args.onChange(next);
    },
  };
}
