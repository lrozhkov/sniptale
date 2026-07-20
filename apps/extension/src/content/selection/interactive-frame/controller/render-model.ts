import React from 'react';
import { getInteractiveFrameDisplay } from '../render-model/render-model';
import type { InteractiveFrameProps } from '../render-model/types';
import {
  createInteractiveFrameRenderResult,
  useInteractiveFrameRenderActions,
} from './render-model.result';
import {
  useInteractiveFrameEditLifecycle,
  useInteractiveFrameRuntime,
} from './render-model.runtime';

/** Builds the full render model for the interactive frame while keeping the entry component thin. */
export function useInteractiveFrameRenderModel({
  frame,
  zIndex,
  onStateChange,
  onUpdate,
  onDelete,
  onCancel,
  onEffectChange,
  defaultEffectMode = 'border',
}: InteractiveFrameProps) {
  const runtime = useInteractiveFrameRuntime({ frame, defaultEffectMode, onStateChange });
  const actions = useInteractiveFrameRenderActions({
    frame,
    runtime,
    onUpdate,
    onDelete,
    ...(onCancel === undefined ? {} : { onCancel }),
    ...(onEffectChange === undefined ? {} : { onEffectChange }),
  });
  useInteractiveFrameEditLifecycle(frame, defaultEffectMode, runtime, actions.handleCancel);
  const frameDisplay = getInteractiveFrameDisplay({
    frame,
    currentFrame: runtime.currentFrame,
    effectMode: runtime.viewState.effectMode,
    state: runtime.viewState.state,
    zIndex,
  });

  React.useEffect(() => {
    if (runtime.refs.frameRef.current) {
      runtime.refs.frameRef.current.style.zIndex = String(frameDisplay.frameZIndex);
    }
  }, [frameDisplay.frameZIndex, runtime.refs.frameRef]);

  return createInteractiveFrameRenderResult(runtime, frameDisplay, actions);
}
