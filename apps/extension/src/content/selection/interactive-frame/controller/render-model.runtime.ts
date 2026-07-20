import React from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import {
  calculateInteractiveFrameSizePanelPosition,
  calculateInteractiveFrameToolbarPosition,
} from '../layout/positioning';
import { resolveInteractiveCurrentFrame } from '../render-model/current-frame';
import { useInteractiveFrameRenderRefs } from '../render-model/render-model';
import { useInteractiveFrameEditing } from './editing';
import {
  useInteractiveFrameEditingEffects,
  useInteractiveFrameExternalExitEffects,
  useInteractiveFrameHistoryApplyReset,
  useInteractiveFramePropSync,
  useInteractiveFrameStateSync,
  useInteractiveFrameTooltipSync,
} from './lifecycle';
import { useInteractiveFrameViewState } from './view-state';

function cloneFrameData(frame: FrameData, options?: { omitLinkedElement?: boolean }): FrameData {
  return {
    id: frame.id,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    ...(frame.linkedElementSelector === undefined
      ? {}
      : { linkedElementSelector: frame.linkedElementSelector }),
    ...(options?.omitLinkedElement || frame.linkedElement === undefined
      ? {}
      : { linkedElement: frame.linkedElement }),
    ...(frame.effectMode === undefined ? {} : { effectMode: frame.effectMode }),
    ...(frame.borderSettings === undefined ? {} : { borderSettings: frame.borderSettings }),
    ...(frame.blurSettings === undefined ? {} : { blurSettings: frame.blurSettings }),
    ...(frame.focusSettings === undefined ? {} : { focusSettings: frame.focusSettings }),
    ...(frame.stepBadge === undefined ? {} : { stepBadge: frame.stepBadge }),
    ...(frame.callout === undefined ? {} : { callout: frame.callout }),
    ...(frame.offset === undefined ? {} : { offset: frame.offset }),
  };
}

export function useInteractiveFrameRuntime(params: {
  frame: FrameData;
  defaultEffectMode: EffectMode;
  onStateChange: ((newState: 'idle' | 'hover' | 'editing') => void) | undefined;
}) {
  const viewState = useInteractiveFrameViewState({
    frame: params.frame,
    defaultEffectMode: params.defaultEffectMode,
  });
  const refs = useInteractiveFrameRenderRefs();
  const runtimeState = useInteractiveFrameRuntimeState({
    frame: params.frame,
    viewState,
  });

  useInteractiveFrameRuntimeSyncs({
    defaultEffectMode: params.defaultEffectMode,
    frame: params.frame,
    isTooltipVisible: runtimeState.isTooltipVisible,
    onStateChange: params.onStateChange,
    viewState,
  });

  return {
    refs,
    viewState,
    ...runtimeState,
    editing: useInteractiveFrameEditing({
      state: viewState.state,
      tempFrame: viewState.tempFrame,
      setTempFrame: viewState.setTempFrame,
      containerRef: refs.containerRef,
      frameId: params.frame.id,
      effectMode: viewState.effectMode,
    }),
  };
}

function useInteractiveFrameRuntimeState(params: {
  frame: FrameData;
  viewState: ReturnType<typeof useInteractiveFrameViewState>;
}) {
  const frameWithoutLinkedElement = React.useMemo(
    () => cloneFrameData(params.frame, { omitLinkedElement: true }),
    [params.frame]
  );
  const currentFrame = resolveInteractiveCurrentFrame({
    frame: params.frame,
    tempFrame: params.viewState.tempFrame,
    state: params.viewState.state,
    isCalloutEditing: params.viewState.isCalloutEditing,
  });
  const normalizedCurrentFrame = cloneFrameData(currentFrame);
  const { sizePanelCoords, toolbarCoords } = useInteractiveFrameFloatingUiLayout({
    currentFrame: normalizedCurrentFrame,
    tempFrame: cloneFrameData(params.viewState.tempFrame),
  });

  return {
    frameWithoutLinkedElement,
    currentFrame: normalizedCurrentFrame,
    toolbarCoords,
    sizePanelCoords,
    isTooltipVisible: params.viewState.activeFrameId === params.frame.id,
    isPopoverOpen: params.viewState.popoverFrameId === params.frame.id,
  };
}

function useInteractiveFrameFloatingUiLayout(params: {
  currentFrame: FrameData;
  tempFrame: FrameData;
}) {
  const toolbarCoords = React.useMemo(
    () => calculateInteractiveFrameToolbarPosition(params.currentFrame),
    [params.currentFrame]
  );
  const sizePanelCoords = React.useMemo(
    () => calculateInteractiveFrameSizePanelPosition(params.tempFrame),
    [params.tempFrame]
  );

  return {
    toolbarCoords,
    sizePanelCoords,
  };
}

function useInteractiveFrameRuntimeSyncs(params: {
  defaultEffectMode: EffectMode;
  frame: FrameData;
  isTooltipVisible: boolean;
  onStateChange: ((newState: 'idle' | 'hover' | 'editing') => void) | undefined;
  viewState: ReturnType<typeof useInteractiveFrameViewState>;
}) {
  useInteractiveFrameStateSync(
    params.onStateChange === undefined
      ? { state: params.viewState.state }
      : { state: params.viewState.state, onStateChange: params.onStateChange }
  );
  useInteractiveFrameTooltipSync({
    isTooltipVisible: params.isTooltipVisible,
    state: params.viewState.state,
    isStepBadgePopoverOpen: params.viewState.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: params.viewState.isCalloutPopoverOpen,
    setState: params.viewState.setState,
  });
  useInteractiveFramePropSync({
    defaultEffectMode: params.defaultEffectMode,
    frame: params.frame,
    isCalloutEditing: params.viewState.isCalloutEditing,
    setEffectMode: params.viewState.setEffectMode,
    setTempFrame: params.viewState.setTempFrame,
    state: params.viewState.state,
  });
}

export function useInteractiveFrameEditLifecycle(
  frame: FrameData,
  defaultEffectMode: EffectMode,
  runtime: ReturnType<typeof useInteractiveFrameRuntime>,
  handleCancel: () => void
) {
  useInteractiveFrameEditingEffects({
    state: runtime.viewState.state,
    isCalloutEditing: runtime.viewState.isCalloutEditing,
    frameWithoutLinkedElement: runtime.frameWithoutLinkedElement,
    setTempFrame: runtime.viewState.setTempFrame,
    setIsStepBadgePopoverOpen: runtime.viewState.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: runtime.viewState.setIsCalloutPopoverOpen,
    handleCancelRef: runtime.refs.handleCancelRef,
    handleSaveRef: runtime.refs.handleSaveRef,
    handleDeleteRef: runtime.refs.handleDeleteRef,
  });
  useInteractiveFrameHistoryApplyReset({
    defaultEffectMode,
    frame,
    setEffectMode: runtime.viewState.setEffectMode,
    setIsCalloutEditing: runtime.viewState.setIsCalloutEditing,
    setIsCalloutPopoverOpen: runtime.viewState.setIsCalloutPopoverOpen,
    setIsStepBadgePopoverOpen: runtime.viewState.setIsStepBadgePopoverOpen,
    setState: runtime.viewState.setState,
    setTempFrame: runtime.viewState.setTempFrame,
  });
  useInteractiveFrameExternalExitEffects({
    state: runtime.viewState.state,
    handleCancel,
  });
}
