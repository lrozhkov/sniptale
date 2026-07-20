import { useMemo } from 'react';
import {
  createInteractiveFrameMouseDownHandler,
  createInteractiveFrameResizeStartHandler,
} from '../editing/pointer-actions';
import type { InteractiveFrameHandlerConfig } from './types';

export function useInteractiveFrameEditingHandlers(params: InteractiveFrameHandlerConfig) {
  const handleMouseDown = useMemo(
    () =>
      createInteractiveFrameMouseDownHandler({
        state: params.state,
        isDraggingRef: params.isDraggingRef,
        startXRef: params.startXRef,
        startYRef: params.startYRef,
        startFrameRef: params.startFrameRef,
        tempFrameRef: params.tempFrameRef,
      }),
    [params]
  );

  const handleResizeStart = useMemo(
    () =>
      createInteractiveFrameResizeStartHandler({
        isResizingRef: params.isResizingRef,
        resizeDirectionRef: params.resizeDirectionRef,
        startXRef: params.startXRef,
        startYRef: params.startYRef,
        startFrameRef: params.startFrameRef,
        tempFrameRef: params.tempFrameRef,
      }),
    [params]
  );

  return { handleMouseDown, handleResizeStart };
}
