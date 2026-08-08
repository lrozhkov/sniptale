import React from 'react';
import type { CalloutAttachment } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  acceptPointerDragEvent,
  finishPointerDragEvent,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../interaction/pointer-drag-session';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';
import {
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const PERIMETER_SNAP_ENTER_DISTANCE = 8;
const PERIMETER_SNAP_RELEASE_DISTANCE = 14;

export type CalloutTailDragStartEvent = PointerDragStartEvent;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getPointerPosition(
  point: Point,
  edgeRect: Rect,
  side: ConnectorSide,
  minPosition: number,
  maxPosition: number
) {
  const isHorizontal = side === 'top' || side === 'bottom';
  const axisStart = isHorizontal ? edgeRect.x : edgeRect.y;
  const axisLength = isHorizontal ? edgeRect.width : edgeRect.height;
  const pointerAxis = isHorizontal ? point.x : point.y;
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

export function projectCalloutPerimeterPosition(
  source: Rect,
  target: Rect,
  position: number
): number {
  const sourcePerimeter = Math.max(1, 2 * (source.width + source.height));
  const distance = clamp(position, 0, 1) * sourcePerimeter;
  let targetDistance: number;
  if (distance <= source.width) {
    targetDistance = (distance / Math.max(1, source.width)) * target.width;
  } else if (distance <= source.width + source.height) {
    const sideOffset = distance - source.width;
    targetDistance = target.width + (sideOffset / Math.max(1, source.height)) * target.height;
  } else if (distance <= source.width * 2 + source.height) {
    const sideOffset = distance - source.width - source.height;
    targetDistance =
      target.width + target.height + (sideOffset / Math.max(1, source.width)) * target.width;
  } else {
    const sideOffset = distance - source.width * 2 - source.height;
    targetDistance =
      target.width * 2 + target.height + (sideOffset / Math.max(1, source.height)) * target.height;
  }
  return targetDistance / Math.max(1, 2 * (target.width + target.height));
}

export function getCalloutPerimeterAnchorPositions(rect: Rect, horizontalGuides: number[] = []) {
  return getCalloutPerimeterAnchors(rect, horizontalGuides).map((anchor) => anchor.position);
}

interface CalloutPerimeterAnchor {
  id: string;
  position: number;
}

export function getCalloutPerimeterAnchors(
  rect: Rect,
  horizontalGuides: number[] = []
): CalloutPerimeterAnchor[] {
  const perimeter = Math.max(1, 2 * (rect.width + rect.height));
  const canonicalOffsets: Array<[string, number]> = [
    ['top-left', 0],
    ['top-center', rect.width / 2],
    ['top-right', rect.width],
    ['right-center', rect.width + rect.height / 2],
    ['bottom-right', rect.width + rect.height],
    ['bottom-center', rect.width + rect.height + rect.width / 2],
    ['bottom-left', 2 * rect.width + rect.height],
    ['left-center', 2 * rect.width + rect.height + rect.height / 2],
  ];
  const guideOffsets: Array<[string, number]> = horizontalGuides.flatMap((guideY, index) => {
    const localY = clamp(guideY - rect.y, 0, rect.height);
    return [
      [`section-${index}-right`, rect.width + localY],
      [`section-${index}-left`, 2 * rect.width + 2 * rect.height - localY],
    ];
  });
  const seen = new Set<number>();
  return [...canonicalOffsets, ...guideOffsets].flatMap(([id, offset]) => {
    if (seen.has(offset)) return [];
    seen.add(offset);
    return [{ id, position: offset / perimeter }];
  });
}

export function resolveCalloutAttachmentPosition(
  rect: Rect,
  attachment: CalloutAttachment | undefined,
  horizontalGuides: number[] = []
) {
  if (!attachment || attachment.mode === 'auto') return undefined;
  if (attachment.mode === 'anchor' && attachment.anchorId) {
    const anchor = getCalloutPerimeterAnchors(rect, horizontalGuides).find(
      (candidate) => candidate.id === attachment.anchorId
    );
    if (anchor) return anchor.position;
  }
  return attachment.perimeterPosition;
}

function getPointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getNearestPerimeterAnchor(rect: Rect, point: Point, anchors: CalloutPerimeterAnchor[]) {
  return anchors.reduce<{
    id: string;
    distance: number;
    position: number;
  } | null>((nearest, anchor) => {
    const distance = getPointDistance(point, getCalloutPerimeterPoint(rect, anchor.position));
    return !nearest || distance < nearest.distance
      ? { distance, id: anchor.id, position: anchor.position }
      : nearest;
  }, null);
}

export function getSnappedCalloutPerimeterPosition(
  rect: Rect,
  point: Point,
  activeSnapPosition: number | null,
  anchorPositions: Array<number | CalloutPerimeterAnchor> = getCalloutPerimeterAnchors(rect),
  visualScale = 1
) {
  const anchors = anchorPositions.map((anchor) =>
    typeof anchor === 'number' ? { id: `position-${anchor}`, position: anchor } : anchor
  );
  if (activeSnapPosition !== null) {
    const snapPoint = getCalloutPerimeterPoint(rect, activeSnapPosition);
    if (getPointDistance(point, snapPoint) <= PERIMETER_SNAP_RELEASE_DISTANCE * visualScale) {
      const activeAnchor = anchors.find(
        (anchor) => Math.abs(anchor.position - activeSnapPosition) < Number.EPSILON
      );
      return {
        position: activeSnapPosition,
        snapAnchorId: activeAnchor?.id ?? null,
        snapPosition: activeSnapPosition,
      };
    }
  }

  const nearestAnchor = getNearestPerimeterAnchor(rect, point, anchors);
  if (nearestAnchor && nearestAnchor.distance <= PERIMETER_SNAP_ENTER_DISTANCE * visualScale) {
    return {
      position: nearestAnchor.position,
      snapAnchorId: nearestAnchor.id,
      snapPosition: nearestAnchor.position,
    };
  }

  return {
    position: getCalloutPerimeterPosition(rect, point),
    snapAnchorId: null,
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

function handleCalloutEdgeKeyDown(
  args: {
    connectorSide: ConnectorSide | null;
    defaultPosition: number;
    edgeRect: Rect;
    isEditing: boolean;
    onPositionChange: (position: number, attachment?: CalloutAttachment) => void;
    perimeter?: boolean;
    position: number | undefined;
    visualScale?: number;
  },
  event: CalloutHandleKeyboardEvent,
  minPosition: number,
  maxPosition: number
) {
  const side = args.connectorSide;
  if (args.isEditing || !side) return;
  const visualScale = args.visualScale ?? 1;
  const delta = getCalloutKeyboardDelta(event);
  if (args.perimeter) {
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const current = getCalloutPerimeterPoint(args.edgeRect, args.position ?? args.defaultPosition);
    const position = getCalloutPerimeterPosition(args.edgeRect, {
      x: current.x + delta.x * visualScale,
      y: current.y + delta.y * visualScale,
    });
    args.onPositionChange(position, { mode: 'free', perimeterPosition: position });
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
    clamp(current + (axisDelta * visualScale) / Math.max(1, axisLength), minPosition, maxPosition)
  );
}

export function useCalloutEdgeDrag(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  connectorSide: ConnectorSide | null;
  defaultPosition: number;
  edgeRect: Rect;
  isEditing: boolean;
  maxPosition?: number;
  minPosition?: number;
  onPositionChange: (position: number, attachment?: CalloutAttachment) => void;
  perimeterAnchors?: CalloutPerimeterAnchor[];
  perimeterAnchorPositions?: number[];
  perimeter?: boolean;
  position: number | undefined;
  visualScale?: number;
}) {
  const [draftPosition, setDraftPosition] = React.useState<number | null>(null);
  const [draftAttachment, setDraftAttachment] = React.useState<CalloutAttachment | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftRef = React.useRef<number | null>(null);
  const draftAttachmentRef = React.useRef<CalloutAttachment | null>(null);
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
    draftAttachmentRef.current = null;
    setDraftAttachment(null);
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
      const point = (
        args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace
      ).clientPointToLogical({ x: event.clientX, y: event.clientY });
      let position: number;
      if (args.perimeter) {
        const snappedPosition = getSnappedCalloutPerimeterPosition(
          args.edgeRect,
          point,
          snapPositionRef.current,
          args.perimeterAnchors ?? args.perimeterAnchorPositions,
          args.visualScale ?? 1
        );
        position = snappedPosition.position;
        snapPositionRef.current = snappedPosition.snapPosition;
        draftAttachmentRef.current = snappedPosition.snapAnchorId
          ? {
              anchorId: snappedPosition.snapAnchorId,
              mode: 'anchor',
              perimeterPosition: position,
            }
          : { mode: 'free', perimeterPosition: position };
        setDraftAttachment(draftAttachmentRef.current);
      } else {
        position = getPointerPosition(
          point,
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
      const attachment = draftAttachmentRef.current;
      draftRef.current = null;
      draftAttachmentRef.current = null;
      setDraftAttachment(null);
      snapPositionRef.current = null;
      if (position !== null) {
        if (attachment) args.onPositionChange(position, attachment);
        else args.onPositionChange(position);
      }
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
  }, [args, cancel, isDragging, maxPosition, minPosition]);

  return {
    draftPosition,
    draftAttachment,
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
      draftAttachmentRef.current = null;
      setDraftAttachment(null);
      if (args.perimeter) {
        const currentPosition = args.position ?? args.defaultPosition;
        const currentPoint = getCalloutPerimeterPoint(args.edgeRect, currentPosition);
        snapPositionRef.current = getSnappedCalloutPerimeterPosition(
          args.edgeRect,
          currentPoint,
          null,
          args.perimeterAnchors ?? args.perimeterAnchorPositions,
          args.visualScale ?? 1
        ).snapPosition;
      }
      setIsDragging(true);
    },
    handleKeyDown: (event: CalloutHandleKeyboardEvent) =>
      handleCalloutEdgeKeyDown(args, event, minPosition, maxPosition),
  };
}
