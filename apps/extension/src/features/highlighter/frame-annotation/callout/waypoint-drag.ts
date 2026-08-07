import React from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { CalloutConnectorWaypoint } from '@sniptale/runtime-contracts/highlighter/callout';
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
  coordinateSpace?: FrameAnnotationCoordinateSpace;
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
  useWaypointPointerSession({
    args,
    cancel,
    draftRef,
    dragOriginPointRef,
    isDragging,
    pendingCommitRef,
    pointerIdRef,
    pointerOffsetRef,
    setDraftPosition,
    setIsDragging,
  });

  return {
    draftPosition,
    handleDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) =>
      clearWaypoint(event, args.onChange),
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => moveWaypointWithKeyboard(args, event),
    handlePointerDown: (event: CalloutWaypointDragStartEvent) =>
      beginWaypointDrag({
        args,
        draftRef,
        dragOriginPointRef,
        event,
        pendingCommitRef,
        pointerIdRef,
        pointerOffsetRef,
        setDraftPosition,
        setIsDragging,
      }),
    isDragging,
  };
}

function useWaypointPointerSession(input: {
  args: Parameters<typeof useCalloutWaypointDrag>[0];
  cancel: () => boolean;
  draftRef: React.RefObject<CalloutConnectorWaypoint | null>;
  dragOriginPointRef: React.RefObject<Point | null>;
  isDragging: boolean;
  pendingCommitRef: React.RefObject<boolean>;
  pointerIdRef: React.RefObject<number | null>;
  pointerOffsetRef: React.RefObject<Point>;
  setDraftPosition: (value: CalloutConnectorWaypoint | null) => void;
  setIsDragging: (value: boolean) => void;
}) {
  React.useEffect(() => {
    if (!input.isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, input.pointerIdRef.current)) return;
      const currentPoint = input.dragOriginPointRef.current ?? input.args.defaultPoint!;
      const point = (
        input.args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace
      ).clientPointToLogical({ x: event.clientX, y: event.clientY });
      const pointerPoint = {
        x: input.args.axis === 'y' ? currentPoint.x : point.x - input.pointerOffsetRef.current.x,
        y: input.args.axis === 'x' ? currentPoint.y : point.y - input.pointerOffsetRef.current.y,
      };
      const waypoint = toWaypoint(
        input.args.frameRect,
        resolveWaypointPoint({
          angleSnap: input.args.angleSnap,
          elbowConstraint: input.args.elbowConstraint,
          point: pointerPoint,
          snapPoints: input.args.snapPoints,
          strictAngleSnap: event.shiftKey,
        })
      );
      input.draftRef.current = waypoint;
      input.setDraftPosition(waypoint);
    };
    const handleUp = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, input.pointerIdRef, () => input.setIsDragging(false)))
        return;
      const waypoint = input.draftRef.current;
      input.dragOriginPointRef.current = null;
      if (waypoint) {
        input.pendingCommitRef.current = true;
        input.args.onChange(waypoint);
      }
    };
    return registerPointerDragSession({
      cancel: input.cancel,
      cancelOnLostPointerCapture: false,
      move: handleMove,
      up: handleUp,
    });
  }, [input]);
}

function beginWaypointDrag(input: {
  args: Parameters<typeof useCalloutWaypointDrag>[0];
  draftRef: React.RefObject<CalloutConnectorWaypoint | null>;
  dragOriginPointRef: React.RefObject<Point | null>;
  event: CalloutWaypointDragStartEvent;
  pendingCommitRef: React.RefObject<boolean>;
  pointerIdRef: React.RefObject<number | null>;
  pointerOffsetRef: React.RefObject<Point>;
  setDraftPosition: (value: CalloutConnectorWaypoint | null) => void;
  setIsDragging: (value: boolean) => void;
}) {
  const { args, event } = input;
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
  const point = (
    args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace
  ).clientPointToLogical({ x: event.clientX, y: event.clientY });
  input.pointerIdRef.current = event.pointerId;
  input.pointerOffsetRef.current = {
    x: point.x - initialPoint.x,
    y: point.y - initialPoint.y,
  };
  input.dragOriginPointRef.current = initialPoint;
  input.draftRef.current = initial;
  input.pendingCommitRef.current = false;
  input.setDraftPosition(initial);
  input.setIsDragging(true);
}

function moveWaypointWithKeyboard(
  args: Parameters<typeof useCalloutWaypointDrag>[0],
  event: CalloutHandleKeyboardEvent
) {
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
}

function clearWaypoint(
  event: ReactMouseEvent<HTMLButtonElement>,
  onChange: (waypoint: CalloutConnectorWaypoint | undefined) => void
) {
  event.preventDefault();
  event.stopPropagation();
  onChange(undefined);
}
