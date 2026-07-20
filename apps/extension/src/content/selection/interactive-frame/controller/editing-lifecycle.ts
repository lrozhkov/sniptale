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
      stateRef: params.stateRef,
      containerRef: params.containerRef,
    })
  );

  useInteractiveFramePointerListeners(
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
      effectModeRef: params.effectModeRef,
    })
  );
}
