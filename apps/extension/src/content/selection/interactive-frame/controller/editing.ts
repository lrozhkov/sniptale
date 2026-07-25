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
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  onUpdate: (frame: FrameData) => void;
}

export function useInteractiveFrameEditing({
  state,
  tempFrame,
  setTempFrame,
  containerRef,
  frameId,
  effectMode,
  setState,
  onUpdate,
}: UseInteractiveFrameEditingParams): {
  abortPointerSession: () => boolean;
  handleMouseDown: (event: React.PointerEvent) => void;
  handleResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
} {
  const session = useInteractiveFrameSessionState(tempFrame, effectMode, state);
  const { activity, current, origin } = session.pointer;
  const abortPointerSession = useInteractiveFrameEditingLifecycle({
    tempFrame,
    effectMode,
    state,
    tempFrameRef: current.tempFrameRef,
    effectModeRef: current.effectModeRef,
    stateRef: session.stateRef,
    containerRef,
    frameId,
    setTempFrame,
    isDraggingRef: activity.isDraggingRef,
    isResizingRef: activity.isResizingRef,
    resizeDirectionRef: activity.resizeDirectionRef,
    startXRef: origin.startXRef,
    startYRef: origin.startYRef,
    startFrameRef: origin.startFrameRef,
    pointerIdRef: activity.pointerIdRef,
    resizeOriginStateRef: activity.resizeOriginStateRef,
    resizeRafIdRef: activity.resizeRafIdRef,
    latestResizeSampleRef: activity.latestResizeSampleRef,
    setState,
    onUpdate,
  });
  const { handleMouseDown, handleResizeStart } = useInteractiveFrameEditingHandlers(
    createInteractiveFrameHandlerConfig({
      frameId,
      state,
      isDraggingRef: activity.isDraggingRef,
      isResizingRef: activity.isResizingRef,
      resizeDirectionRef: activity.resizeDirectionRef,
      startXRef: origin.startXRef,
      startYRef: origin.startYRef,
      startFrameRef: origin.startFrameRef,
      tempFrameRef: current.tempFrameRef,
      pointerIdRef: activity.pointerIdRef,
      resizeOriginStateRef: activity.resizeOriginStateRef,
      resizeRafIdRef: activity.resizeRafIdRef,
      latestResizeSampleRef: activity.latestResizeSampleRef,
      stateRef: session.stateRef,
      setState,
      setTempFrame,
    })
  );

  return {
    abortPointerSession,
    handleMouseDown,
    handleResizeStart,
  };
}
