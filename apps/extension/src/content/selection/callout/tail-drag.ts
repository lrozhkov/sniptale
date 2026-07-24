import React from 'react';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';

type Rect = { x: number; y: number; width: number; height: number };

export interface CalloutTailDragStartEvent {
  button: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
  nativeEvent: { stopImmediatePropagation(): void };
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

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
      if (event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
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
      if (event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const position = draftRef.current;
      pointerIdRef.current = null;
      draftRef.current = null;
      setIsDragging(false);
      if (position !== null) args.onPositionChange(position);
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
