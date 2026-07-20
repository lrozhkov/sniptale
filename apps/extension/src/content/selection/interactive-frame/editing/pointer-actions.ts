import type React from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { applyDragUpdate, applyResizeUpdate } from './helpers';
import type {
  InteractiveFrameHandlerConfig,
  InteractiveFrameListenerConfig,
} from '../controller/types';

export function createInteractiveFrameMouseDownHandler(
  params: Pick<
    InteractiveFrameHandlerConfig,
    'state' | 'isDraggingRef' | 'startXRef' | 'startYRef' | 'startFrameRef' | 'tempFrameRef'
  >
) {
  return (event: React.MouseEvent) => {
    if (params.state !== 'editing') {
      return;
    }
    if ((event.target as HTMLElement).classList.contains('sniptale-resize-handle')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    params.isDraggingRef.current = true;
    params.startXRef.current = event.clientX;
    params.startYRef.current = event.clientY;
    params.startFrameRef.current = { ...params.tempFrameRef.current };
  };
}

export function createInteractiveFrameResizeStartHandler(params: {
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  startFrameRef: React.MutableRefObject<FrameData>;
  tempFrameRef: React.MutableRefObject<FrameData>;
}) {
  return (event: React.MouseEvent, direction: ResizeDirection) => {
    event.preventDefault();
    event.stopPropagation();
    params.isResizingRef.current = true;
    params.resizeDirectionRef.current = direction;
    params.startXRef.current = event.clientX;
    params.startYRef.current = event.clientY;
    params.startFrameRef.current = { ...params.tempFrameRef.current };
  };
}

export function createInteractiveFramePointerMoveHandler(params: InteractiveFrameListenerConfig) {
  return (event: MouseEvent) => {
    if (!params.isDraggingRef.current && !params.isResizingRef.current) {
      return;
    }
    if (params.stateRef.current !== 'editing') {
      return;
    }

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
      });
    }

    if (params.isResizingRef.current && params.resizeDirectionRef.current) {
      applyResizeUpdate({
        event,
        direction: params.resizeDirectionRef.current,
        containerRef: params.containerRef,
        startX: params.startXRef.current,
        startY: params.startYRef.current,
        startFrame: params.startFrameRef.current,
        setTempFrame: params.setTempFrame,
        frameId: params.frameId,
        effectMode: params.effectModeRef.current,
      });
    }
  };
}

export function createInteractiveFramePointerUpHandler(params: {
  isDraggingRef: React.MutableRefObject<boolean>;
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
}) {
  return () => {
    if (params.isDraggingRef.current || params.isResizingRef.current) {
      params.isDraggingRef.current = false;
      params.isResizingRef.current = false;
      params.resizeDirectionRef.current = null;
    }
  };
}
