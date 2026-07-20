import type React from 'react';
import type {
  EffectMode,
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';
import { createInteractiveFrameHandlerConfig } from '../editing/config';
import { useInteractiveFrameEditingHandlers } from './editing-handlers';
import { useInteractiveFrameEditingLifecycle } from './editing-lifecycle';
import { useInteractiveFrameSessionState } from './session-state';

interface UseInteractiveFrameEditingParams {
  state: FrameState;
  tempFrame: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  frameId: string;
  effectMode: EffectMode;
}

export function useInteractiveFrameEditing({
  state,
  tempFrame,
  setTempFrame,
  containerRef,
  frameId,
  effectMode,
}: UseInteractiveFrameEditingParams): {
  handleMouseDown: (event: React.MouseEvent) => void;
  handleResizeStart: (event: React.MouseEvent, direction: ResizeDirection) => void;
} {
  const session = useInteractiveFrameSessionState(tempFrame, effectMode, state);
  useInteractiveFrameEditingLifecycle({
    tempFrame,
    effectMode,
    state,
    tempFrameRef: session.tempFrameRef,
    effectModeRef: session.effectModeRef,
    stateRef: session.stateRef,
    containerRef,
    frameId,
    setTempFrame,
    isDraggingRef: session.isDraggingRef,
    isResizingRef: session.isResizingRef,
    resizeDirectionRef: session.resizeDirectionRef,
    startXRef: session.startXRef,
    startYRef: session.startYRef,
    startFrameRef: session.startFrameRef,
  });
  const { handleMouseDown, handleResizeStart } = useInteractiveFrameEditingHandlers(
    createInteractiveFrameHandlerConfig({
      state,
      isDraggingRef: session.isDraggingRef,
      isResizingRef: session.isResizingRef,
      resizeDirectionRef: session.resizeDirectionRef,
      startXRef: session.startXRef,
      startYRef: session.startYRef,
      startFrameRef: session.startFrameRef,
      tempFrameRef: session.tempFrameRef,
    })
  );

  return {
    handleMouseDown,
    handleResizeStart,
  };
}
