import type React from 'react';
import type {
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';
import { pauseHighlighter, resumeHighlighter } from '../../highlighter';
import { applyDragUpdate, syncInteractiveFrameContainer } from './helpers';
import { updateEffectOverlay } from '../layout/portal';
import type {
  InteractiveFrameHandlerConfig,
  InteractiveFrameListenerConfig,
  InteractiveFramePointerSample,
} from '../controller/types';
import {
  cancelPendingInteractiveFrameResize,
  flushInteractiveFrameResize,
  queueInteractiveFrameResize,
} from './resize-scheduler';

export interface InteractiveFramePointerStartEvent {
  button: number;
  clientX: number;
  clientY: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
  nativeEvent: { stopImmediatePropagation(): void };
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
  target: EventTarget | null;
}

export interface InteractiveFramePointerMoveEvent {
  clientX: number;
  clientY: number;
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

function capturePointer(event: InteractiveFramePointerStartEvent) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail when the host document is being detached.
  }
}

export function createInteractiveFrameMouseDownHandler(
  params: Pick<
    InteractiveFrameHandlerConfig,
    | 'state'
    | 'isDraggingRef'
    | 'startXRef'
    | 'startYRef'
    | 'startFrameRef'
    | 'tempFrameRef'
    | 'pointerIdRef'
  >
) {
  return (event: InteractiveFramePointerStartEvent) => {
    if (params.state !== 'editing') return;
    if ((event.target as HTMLElement).classList.contains('sniptale-resize-handle')) return;

    event.preventDefault();
    event.stopPropagation();
    capturePointer(event);
    params.pointerIdRef.current = event.pointerId;
    params.isDraggingRef.current = true;
    params.startXRef.current = event.clientX;
    params.startYRef.current = event.clientY;
    params.startFrameRef.current = { ...params.tempFrameRef.current };
  };
}

export function createInteractiveFrameResizeStartHandler(params: {
  frameId: string;
  state: FrameState;
  stateRef: React.MutableRefObject<FrameState>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
  resizeOriginStateRef: React.MutableRefObject<FrameState>;
  resizeRafIdRef: React.MutableRefObject<number | null>;
  latestResizeSampleRef: React.MutableRefObject<InteractiveFramePointerSample | null>;
  pointerIdRef: React.MutableRefObject<number | null>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  startFrameRef: React.MutableRefObject<FrameData>;
  tempFrameRef: React.MutableRefObject<FrameData>;
}) {
  return (event: InteractiveFramePointerStartEvent, direction: ResizeDirection) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    capturePointer(event);
    params.pointerIdRef.current = event.pointerId;
    params.isResizingRef.current = true;
    params.resizeDirectionRef.current = direction;
    params.resizeOriginStateRef.current = params.state;
    params.startXRef.current = event.clientX;
    params.startYRef.current = event.clientY;
    params.startFrameRef.current = { ...params.tempFrameRef.current };
    cancelPendingInteractiveFrameResize(params);

    if (params.state !== 'editing') {
      pauseHighlighter();
      params.stateRef.current = 'resizing';
      params.setState('resizing');
      params.setTempFrame({ ...params.tempFrameRef.current });
    }
  };
}

export function createInteractiveFramePointerMoveHandler(params: InteractiveFrameListenerConfig) {
  return (event: InteractiveFramePointerMoveEvent) => {
    if (params.pointerIdRef.current !== event.pointerId) return;
    if (!params.isDraggingRef.current && !params.isResizingRef.current) return;
    if (params.stateRef.current !== 'editing' && params.stateRef.current !== 'resizing') return;

    event.preventDefault();
    event.stopPropagation();

    if (params.isDraggingRef.current) {
      applyDragUpdate({
        event,
        containerRef: params.containerRef,
        startX: params.startXRef.current,
        startY: params.startYRef.current,
        startFrame: params.startFrameRef.current,
        setTempFrame: params.setTempFrame,
        frameId: params.frameId,
        effectMode: params.effectModeRef.current,
        tempFrameRef: params.tempFrameRef,
      });
    }

    if (params.isResizingRef.current && params.resizeDirectionRef.current) {
      queueInteractiveFrameResize(params, event);
    }
  };
}

function clearPointerSession(params: InteractiveFrameListenerConfig) {
  params.isDraggingRef.current = false;
  params.isResizingRef.current = false;
  params.resizeDirectionRef.current = null;
  params.pointerIdRef.current = null;
}

export function createInteractiveFramePointerAbortHandler(params: InteractiveFrameListenerConfig) {
  return () => {
    const hadPointerSession =
      params.isDraggingRef.current ||
      params.isResizingRef.current ||
      params.pointerIdRef.current !== null;
    const shouldResumeHighlighter =
      params.isResizingRef.current && params.resizeOriginStateRef.current !== 'editing';
    cancelPendingInteractiveFrameResize(params);
    clearPointerSession(params);
    if (shouldResumeHighlighter) resumeHighlighter();
    return hadPointerSession;
  };
}

function restoreResizeStart(params: InteractiveFrameListenerConfig) {
  const startFrame = { ...params.startFrameRef.current };
  params.tempFrameRef.current = startFrame;
  params.setTempFrame(startFrame);
  syncInteractiveFrameContainer(params.containerRef.current, startFrame);
  updateEffectOverlay(params.effectModeRef.current, params.frameId, startFrame);
}

function hasFrameGeometryChanged(startFrame: FrameData, endFrame: FrameData): boolean {
  return (
    startFrame.x !== endFrame.x ||
    startFrame.y !== endFrame.y ||
    startFrame.width !== endFrame.width ||
    startFrame.height !== endFrame.height
  );
}

function finishTransientResize(params: InteractiveFrameListenerConfig, commit: boolean) {
  const originState = params.resizeOriginStateRef.current;
  if (originState === 'editing') return;
  const startFrame = params.startFrameRef.current;
  const committedFrame = params.tempFrameRef.current;
  const geometryChanged = hasFrameGeometryChanged(startFrame, committedFrame);
  if (commit) {
    params.onUpdate({ ...committedFrame });
  }
  if (!commit || !geometryChanged) {
    params.stateRef.current = 'hover';
    params.setState('hover');
  }
  resumeHighlighter();
}

export function createInteractiveFramePointerUpHandler(params: InteractiveFrameListenerConfig) {
  return (event: InteractiveFramePointerMoveEvent) => {
    if (params.pointerIdRef.current !== event.pointerId) return;
    const wasResizing = params.isResizingRef.current;
    if (wasResizing) flushInteractiveFrameResize(params, event);
    clearPointerSession(params);
    if (wasResizing) finishTransientResize(params, true);
  };
}

export function createInteractiveFramePointerCancelHandler(params: InteractiveFrameListenerConfig) {
  return () => {
    if (!params.isDraggingRef.current && !params.isResizingRef.current) return false;
    const wasResizing = params.isResizingRef.current;
    cancelPendingInteractiveFrameResize(params);
    restoreResizeStart(params);
    clearPointerSession(params);
    if (wasResizing) finishTransientResize(params, false);
    return true;
  };
}
