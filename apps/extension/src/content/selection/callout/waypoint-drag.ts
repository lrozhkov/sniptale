import React from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { CalloutConnectorWaypoint } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  acceptPointerDragEvent,
  finishPointerDragEvent,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../pointer-drag-session';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

const WAYPOINT_SNAP_DISTANCE = 8;

function snapCoordinate(value: number, candidates: number[]) {
  const nearest = candidates.reduce<number | null>((best, candidate) => {
    if (Math.abs(candidate - value) > WAYPOINT_SNAP_DISTANCE) return best;
    return best === null || Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best;
  }, null);
  return nearest ?? value;
}

function snapWaypoint(point: Point, snapPoints: Point[]) {
  return {
    x: snapCoordinate(
      point.x,
      snapPoints.map((candidate) => candidate.x)
    ),
    y: snapCoordinate(
      point.y,
      snapPoints.map((candidate) => candidate.y)
    ),
  };
}

function toWaypoint(frameRect: Rect, point: Point): CalloutConnectorWaypoint {
  return {
    centerOffsetX: point.x - (frameRect.x + frameRect.width / 2),
    centerOffsetY: point.y - (frameRect.y + frameRect.height / 2),
  };
}

function fromWaypoint(frameRect: Rect, waypoint: CalloutConnectorWaypoint): Point {
  return {
    x: frameRect.x + frameRect.width / 2 + waypoint.centerOffsetX,
    y: frameRect.y + frameRect.height / 2 + waypoint.centerOffsetY,
  };
}

export function useCalloutWaypointDrag(args: {
  axis: 'x' | 'y' | null;
  defaultPoint: Point | null;
  frameRect: Rect;
  isEditing: boolean;
  onChange: (waypoint: CalloutConnectorWaypoint | undefined) => void;
  position: CalloutConnectorWaypoint | undefined;
  snapPoints: Point[];
}) {
  const [draftPosition, setDraftPosition] = React.useState<CalloutConnectorWaypoint | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftRef = React.useRef<CalloutConnectorWaypoint | null>(null);

  const cancel = React.useCallback(() => {
    if (!isDragging) return false;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraftPosition(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const currentPoint = args.position
        ? fromWaypoint(args.frameRect, args.position)
        : args.defaultPoint!;
      const pointerPoint = {
        x: args.axis === 'y' ? currentPoint.x : event.clientX,
        y: args.axis === 'x' ? currentPoint.y : event.clientY,
      };
      const waypoint = toWaypoint(args.frameRect, snapWaypoint(pointerPoint, args.snapPoints));
      draftRef.current = waypoint;
      setDraftPosition(waypoint);
    };
    const handleUp = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, pointerIdRef, () => setIsDragging(false))) return;
      const waypoint = draftRef.current;
      draftRef.current = null;
      setDraftPosition(null);
      if (waypoint) args.onChange(waypoint);
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
  }, [args, cancel, isDragging]);

  const begin = (event: PointerDragStartEvent) => {
    if (args.isEditing || !args.axis || !args.defaultPoint || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The transient portal may be detached while capture is requested.
    }
    const initial = args.position ?? toWaypoint(args.frameRect, args.defaultPoint);
    pointerIdRef.current = event.pointerId;
    draftRef.current = initial;
    setDraftPosition(initial);
    setIsDragging(true);
  };

  const handleKeyDown = (event: CalloutHandleKeyboardEvent) => {
    if (args.isEditing || !args.axis || !args.defaultPoint) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      args.onChange(undefined);
      return;
    }
    const delta = getCalloutKeyboardDelta(event);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const current = args.position ? fromWaypoint(args.frameRect, args.position) : args.defaultPoint;
    const nextPoint = {
      x: args.axis === 'y' ? current.x : current.x + delta.x,
      y: args.axis === 'x' ? current.y : current.y + delta.y,
    };
    args.onChange(toWaypoint(args.frameRect, snapWaypoint(nextPoint, args.snapPoints)));
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    args.onChange(undefined);
  };

  return { draftPosition, handleDoubleClick, handleKeyDown, handlePointerDown: begin, isDragging };
}
