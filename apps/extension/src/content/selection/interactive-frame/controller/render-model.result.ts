import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import type { getInteractiveFrameDisplay } from '../render-model/render-model';
import { useInteractiveFrameActions } from './actions';
import type { useInteractiveFrameRuntime } from './render-model.runtime';

export function useInteractiveFrameRenderActions(params: {
  frame: FrameData;
  runtime: ReturnType<typeof useInteractiveFrameRuntime>;
  onUpdate: (frame: FrameData) => void;
  onDelete: () => void;
  onCancel?: () => void;
  onEffectChange?: (frameId: string, mode: EffectMode) => void;
}) {
  const actions = useInteractiveFrameActions({
    frame: params.frame,
    frameWithoutLinkedElement: params.runtime.frameWithoutLinkedElement,
    tempFrame: params.runtime.viewState.tempFrame,
    effectMode: params.runtime.viewState.effectMode,
    setState: params.runtime.viewState.setState,
    setTempFrame: params.runtime.viewState.setTempFrame,
    setEffectMode: params.runtime.viewState.setEffectMode,
    closePopover: params.runtime.viewState.closePopover,
    openPopover: params.runtime.viewState.openPopover,
    onUpdate: params.onUpdate,
    onDelete: params.onDelete,
    startFrameRef: params.runtime.refs.startFrameRef,
    startEffectModeRef: params.runtime.refs.startEffectModeRef,
    ...(params.onCancel === undefined ? {} : { onCancel: params.onCancel }),
    ...(params.onEffectChange === undefined ? {} : { onEffectChange: params.onEffectChange }),
  });

  params.runtime.refs.handleSaveRef.current = actions.handleSave;
  params.runtime.refs.handleCancelRef.current = actions.handleCancel;
  params.runtime.refs.handleDeleteRef.current = actions.handleDelete;
  return actions;
}

export function createInteractiveFrameRenderResult(
  runtime: ReturnType<typeof useInteractiveFrameRuntime>,
  frameDisplay: ReturnType<typeof getInteractiveFrameDisplay>,
  actions: ReturnType<typeof useInteractiveFrameRenderActions>
) {
  return {
    refs: runtime.refs,
    viewState: runtime.viewState,
    currentFrame: runtime.currentFrame,
    toolbarCoords: runtime.toolbarCoords,
    sizePanelCoords: runtime.sizePanelCoords,
    isPopoverOpen: runtime.isPopoverOpen,
    isFrameActive:
      runtime.isTooltipVisible ||
      runtime.isPopoverOpen ||
      runtime.viewState.isStepBadgePopoverOpen ||
      runtime.viewState.isCalloutPopoverOpen ||
      runtime.viewState.isCalloutEditing ||
      runtime.viewState.state === 'editing',
    ...frameDisplay,
    ...runtime.editing,
    ...actions,
  };
}
