import {
  createInteractiveFrameListenerConfig,
  createInteractiveFrameSyncConfig,
} from '../editing/config';
import { useInteractiveFrameEditingSync } from './editing-sync';
import { useInteractiveFramePointerListeners } from './pointer-listeners';
import type { InteractiveFrameListenerConfig, InteractiveFrameSyncConfig } from './types';

export function useInteractiveFrameEditingLifecycle(
  params: InteractiveFrameSyncConfig & InteractiveFrameListenerConfig
) {
  useInteractiveFrameEditingSync(
    createInteractiveFrameSyncConfig({
      tempFrame: params.tempFrame,
      effectMode: params.effectMode,
      state: params.state,
      tempFrameRef: params.tempFrameRef,
      effectModeRef: params.effectModeRef,
      pointerIdRef: params.pointerIdRef,
      resizeOriginStateRef: params.resizeOriginStateRef,
      setState: params.setState,
      onUpdate: params.onUpdate,
      stateRef: params.stateRef,
      containerRef: params.containerRef,
    })
  );

  return useInteractiveFramePointerListeners(
    createInteractiveFrameListenerConfig({
      containerRef: params.containerRef,
      frameId: params.frameId,
      setTempFrame: params.setTempFrame,
      stateRef: params.stateRef,
      isDraggingRef: params.isDraggingRef,
      isResizingRef: params.isResizingRef,
      resizeDirectionRef: params.resizeDirectionRef,
      startXRef: params.startXRef,
      startYRef: params.startYRef,
      startFrameRef: params.startFrameRef,
      tempFrameRef: params.tempFrameRef,
      effectModeRef: params.effectModeRef,
      pointerIdRef: params.pointerIdRef,
      resizeOriginStateRef: params.resizeOriginStateRef,
      resizeRafIdRef: params.resizeRafIdRef,
      latestResizeSampleRef: params.latestResizeSampleRef,
      setState: params.setState,
      onUpdate: params.onUpdate,
    })
  );
}
