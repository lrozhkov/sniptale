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
import { snapPolylineControlPoint, type PolylineAngleSnap } from './polyline-control';
import { constrainPerpendicularWaypoint, type ElbowWaypointConstraint } from './elbow-control';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

interface CalloutWaypointDragStartEvent extends PointerDragStartEvent {
  clientX: number;
  clientY: number;
}

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

function resolveWaypointPoint(args: {
  angleSnap: PolylineAngleSnap | null | undefined;
  elbowConstraint: ElbowWaypointConstraint | null | undefined;
  point: Point;
  snapPoints: Point[];
  strictAngleSnap: boolean;
}) {
  if (args.angleSnap) {
    return snapPolylineControlPoint({
      point: args.point,
      snap: args.angleSnap,
      strict: args.strictAngleSnap,
    });
  }
  const snapped = snapWaypoint(args.point, args.snapPoints);
  return args.elbowConstraint
    ? constrainPerpendicularWaypoint({ ...args.elbowConstraint, waypoint: snapped })
    : snapped;
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

function areWaypointsEqual(
  left: CalloutConnectorWaypoint | null | undefined,
  right: CalloutConnectorWaypoint | null | undefined
) {
  if (!left || !right) return left === right;
  return left.centerOffsetX === right.centerOffsetX && left.centerOffsetY === right.centerOffsetY;
}

function useCommittedWaypointCleanup(args: {
  draftRef: React.RefObject<CalloutConnectorWaypoint | null>;
  isDragging: boolean;
  pendingCommitRef: React.RefObject<boolean>;
  position: CalloutConnectorWaypoint | undefined;
  setDraftPosition: React.Dispatch<React.SetStateAction<CalloutConnectorWaypoint | null>>;
}) {
  React.useEffect(() => {
    if (
      args.isDragging ||
      !args.pendingCommitRef.current ||
      !args.draftRef.current ||
      !areWaypointsEqual(args.position, args.draftRef.current)
    ) {
      return;
    }
    args.pendingCommitRef.current = false;
    args.draftRef.current = null;
    args.setDraftPosition(null);
  }, [args]);
}

export function useCalloutWaypointDrag(args: {
  angleSnap?: PolylineAngleSnap | null;
  elbowConstraint?: ElbowWaypointConstraint | null;
  axis: 'x' | 'y' | 'both' | null;
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
  const pointerOffsetRef = React.useRef({ x: 0, y: 0 });
  const dragOriginPointRef = React.useRef<Point | null>(null);
  const draftRef = React.useRef<CalloutConnectorWaypoint | null>(null);
  const pendingCommitRef = React.useRef(false);

  useCommittedWaypointCleanup({
    draftRef,
    isDragging,
    pendingCommitRef,
    position: args.position,
    setDraftPosition,
  });

  const cancel = React.useCallback(() => {
    if (!isDragging || pointerIdRef.current === null) return false;
    pointerIdRef.current = null;
    dragOriginPointRef.current = null;
    draftRef.current = null;
    pendingCommitRef.current = false;
    setDraftPosition(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const currentPoint = dragOriginPointRef.current ?? args.defaultPoint!;
      const pointerPoint = {
        x: args.axis === 'y' ? currentPoint.x : event.clientX - pointerOffsetRef.current.x,
        y: args.axis === 'x' ? currentPoint.y : event.clientY - pointerOffsetRef.current.y,
      };
      const waypoint = toWaypoint(
        args.frameRect,
        resolveWaypointPoint({
          angleSnap: args.angleSnap,
          elbowConstraint: args.elbowConstraint,
          point: pointerPoint,
          snapPoints: args.snapPoints,
          strictAngleSnap: event.shiftKey,
        })
      );
      draftRef.current = waypoint;
      setDraftPosition(waypoint);
    };
    const handleUp = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, pointerIdRef, () => setIsDragging(false))) return;
      const waypoint = draftRef.current;
      dragOriginPointRef.current = null;
      if (waypoint) {
        pendingCommitRef.current = true;
        args.onChange(waypoint);
      }
    };
    return registerPointerDragSession({
      cancel,
      cancelOnLostPointerCapture: false,
      move: handleMove,
      up: handleUp,
    });
  }, [args, cancel, isDragging]);

  const begin = (event: CalloutWaypointDragStartEvent) => {
    if (args.isEditing || !args.axis || !args.defaultPoint || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The transient portal may be detached while capture is requested.
    }
    const initialPoint = args.defaultPoint;
    const initial = toWaypoint(args.frameRect, initialPoint);
    pointerIdRef.current = event.pointerId;
    pointerOffsetRef.current = {
      x: event.clientX - initialPoint.x,
      y: event.clientY - initialPoint.y,
    };
    dragOriginPointRef.current = initialPoint;
    draftRef.current = initial;
    pendingCommitRef.current = false;
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
    args.onChange(
      toWaypoint(
        args.frameRect,
        resolveWaypointPoint({
          angleSnap: args.angleSnap,
          elbowConstraint: args.elbowConstraint,
          point: nextPoint,
          snapPoints: args.snapPoints,
          strictAngleSnap: event.shiftKey,
        })
      )
    );
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    args.onChange(undefined);
  };

  return { draftPosition, handleDoubleClick, handleKeyDown, handlePointerDown: begin, isDragging };
}
