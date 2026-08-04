import React from 'react';
import type { CalloutManualPlacement } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';
import { useTransientControlVisibility } from '../interactive-frame/overlays/transient-control-visibility';
import {
  acceptPointerDragEvent,
  commitPointerDragDraft,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../pointer-drag-session';

type Rect = { x: number; y: number; width: number; height: number };

export interface CalloutDragStartEvent extends PointerDragStartEvent {
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type CalloutDragBehavior = { preserveConnectorAnchors: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function areManualPlacementsEqual(
  left: CalloutManualPlacement | null | undefined,
  right: CalloutManualPlacement | null | undefined
): boolean {
  if (!left || !right) return left === right;
  return left.centerOffsetX === right.centerOffsetX && left.centerOffsetY === right.centerOffsetY;
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
  isHandlePinned?: boolean;
  manualPlacement: CalloutManualPlacement | undefined;
  onPositionChange: (placement: CalloutManualPlacement, behavior: CalloutDragBehavior) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [draftPlacement, setDraftPlacement] = React.useState<CalloutManualPlacement | null>(null);
  const [preserveConnectorAnchors, setPreserveConnectorAnchors] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const pointerOffsetRef = React.useRef({ x: 0, y: 0 });
  const draftRef = React.useRef<CalloutManualPlacement | null>(null);
  const startPlacementRef = React.useRef<CalloutManualPlacement | null>(null);
  const startRectRef = React.useRef<{ left: number; top: number } | null>(null);
  const axisLockRef = React.useRef<'x' | 'y' | null>(null);
  const preserveConnectorAnchorsRef = React.useRef(false);
  const observedPlacementRef = React.useRef(args.manualPlacement);
  const handleVisibility = useTransientControlVisibility(
    isDragging || Boolean(args.isHandlePinned)
  );

  React.useEffect(() => {
    const propChanged = !areManualPlacementsEqual(
      observedPlacementRef.current,
      args.manualPlacement
    );
    observedPlacementRef.current = args.manualPlacement;
    if (isDragging || !draftRef.current || !propChanged) return;
    draftRef.current = null;
    setDraftPlacement(null);
    setPreserveConnectorAnchors(false);
  }, [args.manualPlacement, isDragging]);

  const cancel = React.useCallback(() => {
    if (!isDragging || pointerIdRef.current === null) return false;
    pointerIdRef.current = null;
    axisLockRef.current = null;
    draftRef.current = startPlacementRef.current;
    setDraftPlacement(null);
    setPreserveConnectorAnchors(false);
    setIsDragging(false);
    return true;
  }, [isDragging]);

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, pointerIdRef.current)) return;
      const width = args.dimensions.width || args.wrapperRef.current?.offsetWidth || 0;
      const height = args.dimensions.height || args.wrapperRef.current?.offsetHeight || 0;
      const rawLeft = event.clientX - pointerOffsetRef.current.x;
      const rawTop = event.clientY - pointerOffsetRef.current.y;
      const startRect = startRectRef.current;
      if (!event.shiftKey) axisLockRef.current = null;
      if (event.shiftKey && !axisLockRef.current && startRect) {
        axisLockRef.current =
          Math.abs(rawLeft - startRect.left) >= Math.abs(rawTop - startRect.top) ? 'x' : 'y';
      }
      const constrainedLeft = axisLockRef.current === 'y' && startRect ? startRect.left : rawLeft;
      const constrainedTop = axisLockRef.current === 'x' && startRect ? startRect.top : rawTop;
      const left = clamp(constrainedLeft, 8, window.innerWidth - width - 8);
      const top = clamp(constrainedTop, 8, window.innerHeight - height - 8);
      const placement = getManualPlacement({ frameRect: args.frameRect, height, left, top, width });
      preserveConnectorAnchorsRef.current = event.ctrlKey;
      setPreserveConnectorAnchors(event.ctrlKey);
      draftRef.current = placement;
      setDraftPlacement(placement);
    };
    const handleUp = (event: PointerEvent) => {
      commitPointerDragDraft<CalloutManualPlacement>({
        draftRef,
        event,
        initialValue: args.manualPlacement,
        isEqual: areManualPlacementsEqual,
        onClear: () => setDraftPlacement(null),
        onCommit: (placement) =>
          args.onPositionChange(placement, {
            preserveConnectorAnchors: preserveConnectorAnchorsRef.current,
          }),
        onFinish: () => setIsDragging(false),
        pointerIdRef,
      });
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
  }, [args, cancel, isDragging]);

  return {
    draft: draftPlacement === null ? null : { placement: draftPlacement, preserveConnectorAnchors },
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
      axisLockRef.current = null;
      pointerOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      startRectRef.current = { left: rect.left, top: rect.top };
      preserveConnectorAnchorsRef.current = event.ctrlKey;
      setPreserveConnectorAnchors(event.ctrlKey);
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
        getManualPlacement({ frameRect: args.frameRect, height, left, top, width }),
        { preserveConnectorAnchors: false }
      );
    },
    handleFocus: handleVisibility.handleFocus,
    handleBlur: handleVisibility.handleBlur,
    handleMouseEnter: handleVisibility.handleMouseEnter,
    handleMouseLeave: handleVisibility.handleMouseLeave,
  };
}
