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
        pointerIdRef: params.pointerIdRef,
      }),
    [params]
  );

  const handleResizeStart = useMemo(
    () =>
      createInteractiveFrameResizeStartHandler({
        state: params.state,
        stateRef: params.stateRef,
        setState: params.setState,
        setTempFrame: params.setTempFrame,
        isResizingRef: params.isResizingRef,
        resizeDirectionRef: params.resizeDirectionRef,
        startXRef: params.startXRef,
        startYRef: params.startYRef,
        startFrameRef: params.startFrameRef,
        tempFrameRef: params.tempFrameRef,
        pointerIdRef: params.pointerIdRef,
        resizeOriginStateRef: params.resizeOriginStateRef,
        resizeRafIdRef: params.resizeRafIdRef,
        latestResizeSampleRef: params.latestResizeSampleRef,
      }),
    [params]
  );

  return { handleMouseDown, handleResizeStart };
}
