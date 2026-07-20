import React from 'react';
import { areInteractiveFramePropsEqual } from './render-model/comparison';
import { InteractiveFrameContent } from './content';
import type { InteractiveFrameProps } from './types';
import { useInteractiveFrameRenderModel } from './controller/render-model';

// Расширение Window для типов pause/resume и focus/blur mask update
declare global {
  interface Window {
    pauseHighlighter?: () => void;
    resumeHighlighter?: () => void;
    sniptaleUpdateFocusMaskImmediate?: (
      frameId: string,
      x: number,
      y: number,
      width: number,
      height: number
    ) => void;
    sniptaleGetFocusSvgRef?: () => SVGSVGElement | null;
    sniptaleUpdateBlurOverlayImmediate?: (
      frameId: string,
      x: number,
      y: number,
      width: number,
      height: number
    ) => void;
  }
}

export const InteractiveFrame: React.FC<InteractiveFrameProps> = React.memo((props) => {
  const model = useInteractiveFrameRenderModel(props);
  const contentProps = {
    frame: props.frame,
    currentFrame: model.currentFrame,
    frameRef: model.refs.frameRef,
    containerRef: model.refs.containerRef,
    popoverAnchorRef: model.refs.popoverAnchorRef,
    stepBadgePopoverAnchorRef: model.refs.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: model.refs.calloutPopoverAnchorRef,
    frameStyle: model.frameStyle,
    frameZIndex: model.frameZIndex,
    isPopoverOpen: model.isPopoverOpen,
    isFrameActive: model.isFrameActive,
    borderColor: model.borderColor,
    borderWidth: model.borderWidth,
    state: model.viewState.state,
    toolbarCoords: model.toolbarCoords,
    sizePanelCoords: model.sizePanelCoords,
    tempFrame: model.viewState.tempFrame,
    maintainAspectRatio: model.viewState.maintainAspectRatio,
    aspectRatio: model.viewState.aspectRatio,
    effectMode: model.viewState.effectMode,
    isStepBadgePopoverOpen: model.viewState.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: model.viewState.isCalloutPopoverOpen,
    isCalloutEditing: model.viewState.isCalloutEditing,
    setTempFrame: model.viewState.setTempFrame,
    setMaintainAspectRatio: model.viewState.setMaintainAspectRatio,
    setAspectRatio: model.viewState.setAspectRatio,
    setState: model.viewState.setState,
    setIsStepBadgePopoverOpen: model.viewState.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: model.viewState.setIsCalloutPopoverOpen,
    setIsCalloutEditing: model.viewState.setIsCalloutEditing,
    closePopover: model.viewState.closePopover,
    hideTooltip: model.viewState.hideTooltip,
    handleMouseDown: model.handleMouseDown,
    handleResizeStart: model.handleResizeStart,
    handleEffectButtonClick: model.handleEffectButtonClick,
    handleStartEditing: model.handleStartEditing,
    handleSave: model.handleSave,
    handleCancel: model.handleCancel,
    handleDelete: model.handleDelete,
    onUpdate: props.onUpdate,
    ...(model.borderShadow === undefined ? {} : { borderShadow: model.borderShadow }),
  };

  return <InteractiveFrameContent {...contentProps} />;
}, areInteractiveFramePropsEqual);
