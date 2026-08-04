import React from 'react';
import {
  acceptPointerDragEvent,
  finishPointerDragEvent,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../pointer-drag-session';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const PERIMETER_SNAP_ENTER_DISTANCE = 8;
const PERIMETER_SNAP_RELEASE_DISTANCE = 14;

export type CalloutTailDragStartEvent = PointerDragStartEvent;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getPointerPosition(
  event: PointerEvent,
  edgeRect: Rect,
  side: ConnectorSide,
  minPosition: number,
  maxPosition: number
) {
  const isHorizontal = side === 'top' || side === 'bottom';
  const axisStart = isHorizontal ? edgeRect.x : edgeRect.y;
  const axisLength = isHorizontal ? edgeRect.width : edgeRect.height;
  const pointerAxis = isHorizontal ? event.clientX : event.clientY;
  return clamp((pointerAxis - axisStart) / Math.max(1, axisLength), minPosition, maxPosition);
}

export function getCalloutPerimeterPoint(rect: Rect, position: number) {
  const perimeter = Math.max(1, 2 * (rect.width + rect.height));
  let distance = clamp(position, 0, 1) * perimeter;
  if (distance <= rect.width) return { x: rect.x + distance, y: rect.y };
  distance -= rect.width;
  if (distance <= rect.height) return { x: rect.x + rect.width, y: rect.y + distance };
  distance -= rect.height;
  if (distance <= rect.width) return { x: rect.x + rect.width - distance, y: rect.y + rect.height };
  distance -= rect.width;
  return { x: rect.x, y: rect.y + rect.height - Math.min(distance, rect.height) };
}

export function getCalloutPerimeterPosition(rect: Rect, point: { x: number; y: number }) {
  const clampedX = clamp(point.x, rect.x, rect.x + rect.width);
  const clampedY = clamp(point.y, rect.y, rect.y + rect.height);
  const candidates = [
    { distance: Math.abs(point.y - rect.y), offset: clampedX - rect.x },
    {
      distance: Math.abs(point.x - (rect.x + rect.width)),
      offset: rect.width + clampedY - rect.y,
    },
    {
      distance: Math.abs(point.y - (rect.y + rect.height)),
      offset: rect.width + rect.height + rect.x + rect.width - clampedX,
    },
    {
      distance: Math.abs(point.x - rect.x),
      offset: 2 * rect.width + rect.height + rect.y + rect.height - clampedY,
    },
  ];
  const closest = candidates.reduce(
    (best, candidate) => (candidate.distance < best.distance ? candidate : best),
    candidates[0]!
  );
  return closest.offset / Math.max(1, 2 * (rect.width + rect.height));
}

export function getCalloutPerimeterAnchorPositions(rect: Rect, horizontalGuides: number[] = []) {
  const perimeter = Math.max(1, 2 * (rect.width + rect.height));
  const canonicalOffsets = [
    0,
    rect.width / 2,
    rect.width,
    rect.width + rect.height / 2,
    rect.width + rect.height,
    rect.width + rect.height + rect.width / 2,
    2 * rect.width + rect.height,
    2 * rect.width + rect.height + rect.height / 2,
  ];
  const guideOffsets = horizontalGuides.flatMap((guideY) => {
    const localY = clamp(guideY - rect.y, 0, rect.height);
    return [rect.width + localY, 2 * rect.width + 2 * rect.height - localY];
  });
  return [...new Set([...canonicalOffsets, ...guideOffsets])].map((offset) => offset / perimeter);
}

function getPointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getNearestPerimeterAnchor(rect: Rect, point: Point, anchorPositions: number[]) {
  return anchorPositions.reduce<{
    distance: number;
    position: number;
  } | null>((nearest, position) => {
    const distance = getPointDistance(point, getCalloutPerimeterPoint(rect, position));
    return !nearest || distance < nearest.distance ? { distance, position } : nearest;
  }, null);
}

export function getSnappedCalloutPerimeterPosition(
  rect: Rect,
  point: Point,
  activeSnapPosition: number | null,
  anchorPositions = getCalloutPerimeterAnchorPositions(rect)
) {
  if (activeSnapPosition !== null) {
    const snapPoint = getCalloutPerimeterPoint(rect, activeSnapPosition);
    if (getPointDistance(point, snapPoint) <= PERIMETER_SNAP_RELEASE_DISTANCE) {
      return { position: activeSnapPosition, snapPosition: activeSnapPosition };
    }
  }

  const nearestAnchor = getNearestPerimeterAnchor(rect, point, anchorPositions);
  if (nearestAnchor && nearestAnchor.distance <= PERIMETER_SNAP_ENTER_DISTANCE) {
    return { position: nearestAnchor.position, snapPosition: nearestAnchor.position };
  }

  return {
    position: getCalloutPerimeterPosition(rect, point),
    snapPosition: null,
  };
}

export function getCalloutTailDragCursor(side: ConnectorSide | null) {
  return side === 'top' || side === 'bottom' ? 'ew-resize' : 'ns-resize';
}

export function getCalloutEdgePosition(
  edgeRect: Rect,
  side: ConnectorSide | null,
  point: { x: number; y: number } | undefined
) {
  if (!side || !point) return 0.5;
  return side === 'top' || side === 'bottom'
    ? clamp((point.x - edgeRect.x) / Math.max(1, edgeRect.width), 0, 1)
    : clamp((point.y - edgeRect.y) / Math.max(1, edgeRect.height), 0, 1);
}

export function useCalloutEdgeDrag(args: {
  connectorSide: ConnectorSide | null;
  defaultPosition: number;
  edgeRect: Rect;
  isEditing: boolean;
  maxPosition?: number;
  minPosition?: number;
  onPositionChange: (position: number) => void;
  perimeterAnchorPositions?: number[];
  perimeter?: boolean;
  position: number | undefined;
}) {
  const [draftPosition, setDraftPosition] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftRef = React.useRef<number | null>(null);
  const snapPositionRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isDragging) setDraftPosition(null);
  }, [args.position, isDragging]);

  const minPosition = args.minPosition ?? 0;
  const maxPosition = args.maxPosition ?? 1;

  const cancel = React.useCallback(() => {
    if (!isDragging) return false;
    pointerIdRef.current = null;
    draftRef.current = null;
    snapPositionRef.current = null;
    setDraftPosition(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    const connectorSide = args.connectorSide;
    if (!isDragging || !connectorSide) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const point = { x: event.clientX, y: event.clientY };
      let position: number;
      if (args.perimeter) {
        const snappedPosition = getSnappedCalloutPerimeterPosition(
          args.edgeRect,
          point,
          snapPositionRef.current,
          args.perimeterAnchorPositions
        );
        position = snappedPosition.position;
        snapPositionRef.current = snappedPosition.snapPosition;
      } else {
        position = getPointerPosition(
          event,
          args.edgeRect,
          connectorSide,
          minPosition,
          maxPosition
        );
      }
      draftRef.current = position;
      setDraftPosition(position);
    };
    const handleUp = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, pointerIdRef, () => setIsDragging(false))) return;
      const position = draftRef.current;
      draftRef.current = null;
      snapPositionRef.current = null;
      if (position !== null) args.onPositionChange(position);
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
  }, [args, cancel, isDragging, maxPosition, minPosition]);

  return {
    draftPosition,
    isDragging,
    handlePointerDown: (event: CalloutTailDragStartEvent) => {
      if (args.isEditing || !args.connectorSide || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The transient portal may be detached while capture is requested.
      }
      pointerIdRef.current = event.pointerId;
      draftRef.current = null;
      if (args.perimeter) {
        const currentPosition = args.position ?? args.defaultPosition;
        const currentPoint = getCalloutPerimeterPoint(args.edgeRect, currentPosition);
        snapPositionRef.current = getSnappedCalloutPerimeterPosition(
          args.edgeRect,
          currentPoint,
          null,
          args.perimeterAnchorPositions
        ).snapPosition;
      }
      setIsDragging(true);
    },
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => {
      const side = args.connectorSide;
      if (args.isEditing || !side) return;
      const delta = getCalloutKeyboardDelta(event);
      if (args.perimeter) {
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const current = getCalloutPerimeterPoint(
          args.edgeRect,
          args.position ?? args.defaultPosition
        );
        args.onPositionChange(
          getCalloutPerimeterPosition(args.edgeRect, {
            x: current.x + delta.x,
            y: current.y + delta.y,
          })
        );
        return;
      }
      const horizontal = side === 'top' || side === 'bottom';
      const axisDelta = horizontal ? delta?.x : delta?.y;
      if (!axisDelta) return;
      event.preventDefault();
      event.stopPropagation();
      const axisLength = horizontal ? args.edgeRect.width : args.edgeRect.height;
      const current = args.position ?? args.defaultPosition;
      args.onPositionChange(
        clamp(current + axisDelta / Math.max(1, axisLength), minPosition, maxPosition)
      );
    },
  };
}
