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
  position: number | undefined;
}) {
  const [draftPosition, setDraftPosition] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isDragging) setDraftPosition(null);
  }, [args.position, isDragging]);

  const minPosition = args.minPosition ?? 0;
  const maxPosition = args.maxPosition ?? 1;

  const cancel = React.useCallback(() => {
    if (!isDragging) return false;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraftPosition(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    const connectorSide = args.connectorSide;
    if (!isDragging || !connectorSide) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const position = getPointerPosition(
        event,
        args.edgeRect,
        connectorSide,
        minPosition,
        maxPosition
      );
      draftRef.current = position;
      setDraftPosition(position);
    };
    const handleUp = (event: PointerEvent) => {
      if (!finishPointerDragEvent(event, pointerIdRef, () => setIsDragging(false))) return;
      const position = draftRef.current;
      draftRef.current = null;
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
      setIsDragging(true);
    },
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => {
      const side = args.connectorSide;
      if (args.isEditing || !side) return;
      const delta = getCalloutKeyboardDelta(event);
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
