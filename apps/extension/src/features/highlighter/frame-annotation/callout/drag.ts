import React from 'react';
import type {
  CalloutConnectorWaypoint,
  CalloutManualPlacement,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutKeyboardDelta, type CalloutHandleKeyboardEvent } from './keyboard';
import { useTransientControlVisibility } from '../interaction/transient-control-visibility';
import {
  acceptPointerDragEvent,
  commitPointerDragDraft,
  registerPointerDragSession,
  type PointerDragStartEvent,
} from '../interaction/pointer-drag-session';
import {
  domRectToFrameAnnotationRect,
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

type Rect = { x: number; y: number; width: number; height: number };

export interface CalloutDragStartEvent extends PointerDragStartEvent {
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type CalloutDragBehavior = {
  connectorBasePosition?: number | undefined;
  connectorBaseWidth?: number | undefined;
  connectorFramePosition?: number | undefined;
  connectorWaypoint?: CalloutConnectorWaypoint | undefined;
  translateConnectorGeometry: boolean;
};

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
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  frameRect: Rect;
  dimensions: { width: number; height: number };
  isEditing: boolean;
  isHandlePinned?: boolean;
  manualPlacement: CalloutManualPlacement | undefined;
  onPositionChange: (placement: CalloutManualPlacement, behavior: CalloutDragBehavior) => void;
  onMoveEnd?: () => void;
  projectMoveRect?: (rect: Rect) => Rect;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [draftPlacement, setDraftPlacement] = React.useState<CalloutManualPlacement | null>(null);
  const [translateConnectorGeometry, setTranslateConnectorGeometry] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const pointerOffsetRef = React.useRef({ x: 0, y: 0 });
  const draftRef = React.useRef<CalloutManualPlacement | null>(null);
  const startPlacementRef = React.useRef<CalloutManualPlacement | null>(null);
  const startRectRef = React.useRef<{ left: number; top: number } | null>(null);
  const axisLockRef = React.useRef<'x' | 'y' | null>(null);
  const translateConnectorGeometryRef = React.useRef(false);
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
    setTranslateConnectorGeometry(false);
  }, [args.manualPlacement, isDragging]);

  const cancel = React.useCallback(() => {
    if (!isDragging || pointerIdRef.current === null) return false;
    pointerIdRef.current = null;
    axisLockRef.current = null;
    draftRef.current = startPlacementRef.current;
    setDraftPlacement(null);
    setTranslateConnectorGeometry(false);
    setIsDragging(false);
    return true;
  }, [isDragging]);
  useCalloutDragPointerSession({
    args,
    axisLockRef,
    cancel,
    draftRef,
    isDragging,
    pointerIdRef,
    pointerOffsetRef,
    setDraftPlacement,
    setIsDragging,
    setTranslateConnectorGeometry,
    startRectRef,
    translateConnectorGeometryRef,
  });

  return {
    draft:
      draftPlacement === null ? null : { placement: draftPlacement, translateConnectorGeometry },
    isDragging,
    isHandleVisible: !args.isEditing && handleVisibility.isVisible,
    handlePointerDown: (event: CalloutDragStartEvent) =>
      beginCalloutDrag({
        args,
        axisLockRef,
        draftRef,
        event,
        pointerIdRef,
        pointerOffsetRef,
        setIsDragging,
        setTranslateConnectorGeometry,
        startPlacementRef,
        startRectRef,
        translateConnectorGeometryRef,
      }),
    handleKeyDown: (event: CalloutHandleKeyboardEvent) => moveCalloutWithKeyboard(args, event),
    handleFocus: handleVisibility.handleFocus,
    handleBlur: handleVisibility.handleBlur,
    handleMouseEnter: handleVisibility.handleMouseEnter,
    handleMouseLeave: handleVisibility.handleMouseLeave,
  };
}

function useCalloutDragPointerSession(input: {
  args: Parameters<typeof useCalloutDrag>[0];
  axisLockRef: React.RefObject<'x' | 'y' | null>;
  cancel: () => boolean;
  draftRef: React.RefObject<CalloutManualPlacement | null>;
  isDragging: boolean;
  pointerIdRef: React.RefObject<number | null>;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
  setDraftPlacement: (value: CalloutManualPlacement | null) => void;
  setIsDragging: (value: boolean) => void;
  setTranslateConnectorGeometry: (value: boolean) => void;
  startRectRef: React.RefObject<{ left: number; top: number } | null>;
  translateConnectorGeometryRef: React.RefObject<boolean>;
}) {
  React.useEffect(() => {
    if (!input.isDragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!acceptPointerDragEvent(event, input.pointerIdRef.current)) return;
      const width = input.args.dimensions.width || input.args.wrapperRef.current?.offsetWidth || 0;
      const height =
        input.args.dimensions.height || input.args.wrapperRef.current?.offsetHeight || 0;
      const coordinateSpace = input.args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
      const point = coordinateSpace.clientPointToLogical({ x: event.clientX, y: event.clientY });
      const rawLeft = point.x - input.pointerOffsetRef.current.x;
      const rawTop = point.y - input.pointerOffsetRef.current.y;
      const startRect = input.startRectRef.current;
      if (!event.shiftKey) input.axisLockRef.current = null;
      if (event.shiftKey && !input.axisLockRef.current && startRect) {
        input.axisLockRef.current =
          Math.abs(rawLeft - startRect.left) >= Math.abs(rawTop - startRect.top) ? 'x' : 'y';
      }
      const constrainedLeft =
        input.axisLockRef.current === 'y' && startRect ? startRect.left : rawLeft;
      const constrainedTop =
        input.axisLockRef.current === 'x' && startRect ? startRect.top : rawTop;
      const bounded = {
        x: clamp(constrainedLeft, 8, coordinateSpace.viewport.width - width - 8),
        y: clamp(constrainedTop, 8, coordinateSpace.viewport.height - height - 8),
        width,
        height,
      };
      const projected = input.args.projectMoveRect?.(bounded) ?? bounded;
      const left = clamp(projected.x, 8, coordinateSpace.viewport.width - width - 8);
      const top = clamp(projected.y, 8, coordinateSpace.viewport.height - height - 8);
      const placement = getManualPlacement({
        frameRect: input.args.frameRect,
        height,
        left,
        top,
        width,
      });
      input.translateConnectorGeometryRef.current = event.ctrlKey;
      input.setTranslateConnectorGeometry(event.ctrlKey);
      input.draftRef.current = placement;
      input.setDraftPlacement(placement);
    };
    const handleUp = (event: PointerEvent) => {
      commitPointerDragDraft<CalloutManualPlacement>({
        draftRef: input.draftRef,
        event,
        initialValue: input.args.manualPlacement,
        isEqual: areManualPlacementsEqual,
        onClear: () => input.setDraftPlacement(null),
        onCommit: (placement) =>
          input.args.onPositionChange(placement, {
            translateConnectorGeometry: input.translateConnectorGeometryRef.current,
          }),
        onFinish: () => {
          input.setIsDragging(false);
          input.args.onMoveEnd?.();
        },
        pointerIdRef: input.pointerIdRef,
      });
    };
    return registerPointerDragSession({ cancel: input.cancel, move: handleMove, up: handleUp });
  }, [input]);
}

function beginCalloutDrag(input: {
  args: Parameters<typeof useCalloutDrag>[0];
  axisLockRef: React.RefObject<'x' | 'y' | null>;
  draftRef: React.RefObject<CalloutManualPlacement | null>;
  event: CalloutDragStartEvent;
  pointerIdRef: React.RefObject<number | null>;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
  setIsDragging: (value: boolean) => void;
  setTranslateConnectorGeometry: (value: boolean) => void;
  startPlacementRef: React.RefObject<CalloutManualPlacement | null>;
  startRectRef: React.RefObject<{ left: number; top: number } | null>;
  translateConnectorGeometryRef: React.RefObject<boolean>;
}) {
  const { args, event } = input;
  if (args.isEditing || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
  const clientRect = args.wrapperRef.current?.getBoundingClientRect();
  if (!clientRect) return;
  const coordinateSpace = args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
  const rect = coordinateSpace.clientRectToLogical(domRectToFrameAnnotationRect(clientRect));
  const point = coordinateSpace.clientPointToLogical({ x: event.clientX, y: event.clientY });
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // The portal may be detached while capture is requested.
  }
  input.pointerIdRef.current = event.pointerId;
  input.axisLockRef.current = null;
  input.pointerOffsetRef.current = { x: point.x - rect.x, y: point.y - rect.y };
  input.startRectRef.current = { left: rect.x, top: rect.y };
  input.translateConnectorGeometryRef.current = event.ctrlKey;
  input.setTranslateConnectorGeometry(event.ctrlKey);
  input.startPlacementRef.current = args.manualPlacement ?? null;
  input.draftRef.current = args.manualPlacement ?? null;
  input.setIsDragging(true);
}

function moveCalloutWithKeyboard(
  args: Parameters<typeof useCalloutDrag>[0],
  event: CalloutHandleKeyboardEvent
) {
  if (args.isEditing) return;
  const delta = getCalloutKeyboardDelta(event);
  const clientRect = args.wrapperRef.current?.getBoundingClientRect();
  if (!delta || !clientRect) return;
  const coordinateSpace = args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
  const rect = coordinateSpace.clientRectToLogical(domRectToFrameAnnotationRect(clientRect));
  event.preventDefault();
  event.stopPropagation();
  const width = args.dimensions.width || rect.width;
  const height = args.dimensions.height || rect.height;
  const left = clamp(rect.x + delta.x, 8, coordinateSpace.viewport.width - width - 8);
  const top = clamp(rect.y + delta.y, 8, coordinateSpace.viewport.height - height - 8);
  args.onPositionChange(
    getManualPlacement({ frameRect: args.frameRect, height, left, top, width }),
    { translateConnectorGeometry: false }
  );
}
