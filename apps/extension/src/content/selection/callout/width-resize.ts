import React from 'react';
import { registerPointerDragSession } from '../pointer-drag-session';
import type {
  CalloutManualPlacement,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { CalloutHandleKeyboardEvent } from './keyboard';
import { clampCalloutWrapWidth } from './width-constraints';

type Rect = { x: number; y: number; width: number; height: number };
type ResizeSide = 'left' | 'right';

export interface CalloutWidthResizeStartEvent {
  button: number;
  clientX: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
  nativeEvent: { stopImmediatePropagation(): void };
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

type ResizeDraft = {
  maxWidth: number;
  placement: CalloutManualPlacement;
};

type ActiveResize = {
  fixedEdgeX: number;
  fixedCenterY: number;
  pointerId: number;
  side: ResizeSide;
  startMaxWidth: number;
  startPointerX: number;
};

type CalloutWidthResizeArgs = {
  dimensions: { width: number; height: number };
  frameRect: Rect;
  isEditing: boolean;
  manualPlacement: CalloutSettings['placement']['manualPlacement'];
  maxWidth: number;
  onWidthChange: (maxWidth: number, placement: CalloutManualPlacement) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
};

function areManualPlacementsEqual(
  left: CalloutManualPlacement | null | undefined,
  right: CalloutManualPlacement | null | undefined
) {
  if (!left || !right) return left === right;
  return left.centerOffsetX === right.centerOffsetX && left.centerOffsetY === right.centerOffsetY;
}

function getPlacement(args: {
  active: ActiveResize;
  dimensions: { width: number; height: number };
  frameRect: Rect;
}): CalloutManualPlacement {
  const frameCenterX = args.frameRect.x + args.frameRect.width / 2;
  const frameCenterY = args.frameRect.y + args.frameRect.height / 2;
  const centerX =
    args.active.side === 'left'
      ? args.active.fixedEdgeX - args.dimensions.width / 2
      : args.active.fixedEdgeX + args.dimensions.width / 2;
  return {
    centerOffsetX: centerX - frameCenterX,
    centerOffsetY: args.active.fixedCenterY - frameCenterY,
  };
}

function getDraft(args: {
  active: ActiveResize;
  clientX: number;
  dimensions: { width: number; height: number };
  frameRect: Rect;
}): ResizeDraft {
  const pointerDelta = args.clientX - args.active.startPointerX;
  const widthDelta = args.active.side === 'left' ? -pointerDelta : pointerDelta;
  return {
    maxWidth: clampCalloutWrapWidth(args.active.startMaxWidth + widthDelta),
    placement: getPlacement(args),
  };
}

function useCalloutWidthResizeState(args: CalloutWidthResizeArgs) {
  const [draft, setDraft] = React.useState<ResizeDraft | null>(null);
  const [activeSide, setActiveSide] = React.useState<ResizeSide | null>(null);
  const activeRef = React.useRef<ActiveResize | null>(null);
  const draftRef = React.useRef<ResizeDraft | null>(null);
  const observedSettingsRef = React.useRef({
    manualPlacement: args.manualPlacement,
    maxWidth: args.maxWidth,
  });

  React.useEffect(() => {
    const previous = observedSettingsRef.current;
    const settingsChanged =
      previous.maxWidth !== args.maxWidth ||
      !areManualPlacementsEqual(previous.manualPlacement, args.manualPlacement);
    observedSettingsRef.current = {
      manualPlacement: args.manualPlacement,
      maxWidth: args.maxWidth,
    };
    if (activeSide || !draftRef.current || !settingsChanged) return;
    draftRef.current = null;
    setDraft(null);
  }, [activeSide, args.manualPlacement, args.maxWidth]);

  const dimensions = args.dimensions;
  const frameRect = args.frameRect;
  React.useEffect(() => {
    const active = activeRef.current;
    const currentDraft = draftRef.current;
    if (!active || !currentDraft) return;
    const nextDraft = {
      ...currentDraft,
      placement: getPlacement({
        active,
        dimensions,
        frameRect,
      }),
    };
    if (areManualPlacementsEqual(nextDraft.placement, currentDraft.placement)) return;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [dimensions, frameRect]);

  return {
    activeRef,
    activeSide,
    draft,
    draftRef,
    setActiveSide,
    setDraft,
  };
}

type WidthResizeState = ReturnType<typeof useCalloutWidthResizeState>;

function useCalloutWidthResizeLifecycle(args: {
  callout: CalloutWidthResizeArgs;
  cancel: () => boolean;
  state: WidthResizeState;
}) {
  const { callout, cancel, state } = args;
  const { activeRef, activeSide, draftRef, setActiveSide, setDraft } = state;
  const { dimensions, frameRect, manualPlacement, maxWidth, onWidthChange } = callout;

  React.useEffect(() => {
    if (!activeSide) return;
    const handleMove = (event: PointerEvent) => {
      const active = activeRef.current;
      if (!active || event.pointerId !== active.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const nextDraft = getDraft({
        active,
        clientX: event.clientX,
        dimensions,
        frameRect,
      });
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    };
    const handleUp = (event: PointerEvent) => {
      const active = activeRef.current;
      if (!active || event.pointerId !== active.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const committedDraft = draftRef.current;
      activeRef.current = null;
      setActiveSide(null);
      if (!committedDraft) return;
      const didChange =
        committedDraft.maxWidth !== maxWidth ||
        !areManualPlacementsEqual(committedDraft.placement, manualPlacement);
      if (!didChange) {
        draftRef.current = null;
        setDraft(null);
        return;
      }
      onWidthChange(committedDraft.maxWidth, committedDraft.placement);
    };
    return registerPointerDragSession({ cancel, move: handleMove, up: handleUp });
  }, [
    activeRef,
    activeSide,
    cancel,
    dimensions,
    draftRef,
    frameRect,
    manualPlacement,
    maxWidth,
    onWidthChange,
    setActiveSide,
    setDraft,
  ]);
}

export function useCalloutWidthResize(args: CalloutWidthResizeArgs) {
  const state = useCalloutWidthResizeState(args);
  const { activeRef, draftRef, setActiveSide, setDraft } = state;
  const cancel = React.useCallback(() => {
    if (!activeRef.current) return false;
    activeRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setActiveSide(null);
    return true;
  }, [activeRef, draftRef, setActiveSide, setDraft]);
  useCalloutWidthResizeLifecycle({ callout: args, cancel, state });

  const handlePointerDown = (side: ResizeSide, event: CalloutWidthResizeStartEvent) => {
    if (args.isEditing || event.button !== 0) return;
    const rect = args.wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The portal may be detached while capture is requested.
    }
    state.activeRef.current = {
      fixedEdgeX: side === 'left' ? rect.right : rect.left,
      fixedCenterY: rect.top + rect.height / 2,
      pointerId: event.pointerId,
      side,
      startMaxWidth: args.maxWidth,
      startPointerX: event.clientX,
    };
    state.draftRef.current = null;
    state.setDraft(null);
    state.setActiveSide(side);
  };

  const handleKeyDown = (side: ResizeSide, event: CalloutHandleKeyboardEvent) => {
    if (args.isEditing || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const rect = args.wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const sideDirection = side === 'right' ? direction : -direction;
    const nextMaxWidth = clampCalloutWrapWidth(
      args.maxWidth + sideDirection * (event.shiftKey ? 10 : 5)
    );
    if (nextMaxWidth === args.maxWidth) return;
    const active: ActiveResize = {
      fixedEdgeX: side === 'left' ? rect.right : rect.left,
      fixedCenterY: rect.top + rect.height / 2,
      pointerId: -1,
      side,
      startMaxWidth: args.maxWidth,
      startPointerX: 0,
    };
    args.onWidthChange(
      nextMaxWidth,
      getPlacement({ active, dimensions: args.dimensions, frameRect: args.frameRect })
    );
  };

  return {
    activeSide: state.activeSide,
    draftMaxWidth: state.draft?.maxWidth ?? null,
    draftPlacement: state.draft?.placement ?? null,
    isResizing: state.activeSide !== null,
    handlePointerDown,
    handleKeyDown,
  };
}
