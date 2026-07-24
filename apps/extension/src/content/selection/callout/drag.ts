import React from 'react';
import type { CalloutManualPlacement } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';
import { useCalloutHandleVisibility } from './handle-visibility';

type Rect = { x: number; y: number; width: number; height: number };

export interface CalloutDragStartEvent {
  button: number;
  clientX: number;
  clientY: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
  nativeEvent: { stopImmediatePropagation(): void };
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getManualPlacement(args: {
  frameRect: Rect;
  height: number;
  left: number;
  top: number;
  width: number;
}): CalloutManualPlacement {
  return {
    centerOffsetX: args.left + args.width / 2 - (args.frameRect.x + args.frameRect.width / 2),
    centerOffsetY: args.top + args.height / 2 - (args.frameRect.y + args.frameRect.height / 2),
  };
}

export function useCalloutDrag(args: {
  frameRect: Rect;
  dimensions: { width: number; height: number };
  isEditing: boolean;
  manualPlacement: CalloutManualPlacement | undefined;
  onPositionChange: (placement: CalloutManualPlacement) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [draftPlacement, setDraftPlacement] = React.useState<CalloutManualPlacement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const pointerOffsetRef = React.useRef({ x: 0, y: 0 });
  const draftRef = React.useRef<CalloutManualPlacement | null>(null);
  const startPlacementRef = React.useRef<CalloutManualPlacement | null>(null);
  const handleVisibility = useCalloutHandleVisibility(isDragging);

  React.useEffect(() => {
    if (!isDragging) setDraftPlacement(null);
  }, [args.manualPlacement?.centerOffsetX, args.manualPlacement?.centerOffsetY, isDragging]);

  const cancel = React.useCallback(() => {
    if (!isDragging) return false;
    pointerIdRef.current = null;
    draftRef.current = startPlacementRef.current;
    setDraftPlacement(null);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const width = args.dimensions.width || args.wrapperRef.current?.offsetWidth || 0;
      const height = args.dimensions.height || args.wrapperRef.current?.offsetHeight || 0;
      const left = clamp(
        event.clientX - pointerOffsetRef.current.x,
        8,
        window.innerWidth - width - 8
      );
      const top = clamp(
        event.clientY - pointerOffsetRef.current.y,
        8,
        window.innerHeight - height - 8
      );
      const placement = getManualPlacement({ frameRect: args.frameRect, height, left, top, width });
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
      if (placement) args.onPositionChange(placement);
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
    isHandleVisible: !args.isEditing && handleVisibility.isVisible,
    handlePointerDown: (event: CalloutDragStartEvent) => {
      if (args.isEditing || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const rect = args.wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The portal may be detached while capture is requested.
      }
      pointerIdRef.current = event.pointerId;
      pointerOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      startPlacementRef.current = args.manualPlacement ?? null;
      draftRef.current = args.manualPlacement ?? null;
      setIsDragging(true);
    },
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => {
      if (args.isEditing) return;
      const delta = getCalloutKeyboardDelta(event);
      const rect = args.wrapperRef.current?.getBoundingClientRect();
      if (!delta || !rect) return;
      event.preventDefault();
      event.stopPropagation();
      const width = args.dimensions.width || rect.width;
      const height = args.dimensions.height || rect.height;
      const left = clamp(rect.left + delta.x, 8, window.innerWidth - width - 8);
      const top = clamp(rect.top + delta.y, 8, window.innerHeight - height - 8);
      args.onPositionChange(
        getManualPlacement({ frameRect: args.frameRect, height, left, top, width })
      );
    },
    handleFocus: handleVisibility.handleFocus,
    handleBlur: handleVisibility.handleBlur,
    handleMouseEnter: handleVisibility.handleMouseEnter,
    handleMouseLeave: handleVisibility.handleMouseLeave,
  };
}
