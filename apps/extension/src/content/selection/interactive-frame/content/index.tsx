import React from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { InteractiveFrameFrameShell } from '../frame/shell';
import {
  InteractiveFrameFloatingUi,
  type InteractiveFrameFloatingUiProps,
} from '../overlays/floating';
import { InteractiveFramePopovers, type InteractiveFramePopoversProps } from '../overlays/popovers';

interface InteractiveFrameContentProps
  extends Omit<InteractiveFrameFloatingUiProps, 'frameId'>, InteractiveFramePopoversProps {
  currentFrame: FrameData;
  frameRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  frameStyle: React.CSSProperties;
  borderColor: string;
  borderWidth: number;
  borderShadow?: NonNullable<FrameData['borderSettings']>['shadow'];
  handleMouseDown: (event: React.MouseEvent) => void;
  handleResizeStart: (event: React.MouseEvent, direction: ResizeDirection) => void;
}

/** Renders the frame chrome and all floating controls while preserving existing content-script contracts. */
export function InteractiveFrameContent(props: InteractiveFrameContentProps) {
  return (
    <>
      <InteractiveFrameFrameShell {...props} />
      <InteractiveFrameFloatingUi {...getInteractiveFrameFloatingUiProps(props)} />
      <InteractiveFramePopovers {...getInteractiveFramePopoverProps(props)} />
    </>
  );
}

function getInteractiveFrameFloatingUiProps(props: InteractiveFrameContentProps) {
  return {
    frame: props.currentFrame,
    frameId: props.frame.id,
    state: props.state,
    toolbarCoords: props.toolbarCoords,
    sizePanelCoords: props.sizePanelCoords,
    tempFrame: props.tempFrame,
    effectMode: props.effectMode,
    isPopoverOpen: props.isPopoverOpen,
    isFrameActive: props.isFrameActive,
    isStepBadgePopoverOpen: props.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: props.isCalloutPopoverOpen,
    isCalloutEditing: props.isCalloutEditing,
    maintainAspectRatio: props.maintainAspectRatio,
    aspectRatio: props.aspectRatio,
    popoverAnchorRef: props.popoverAnchorRef,
    stepBadgePopoverAnchorRef: props.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: props.calloutPopoverAnchorRef,
    setTempFrame: props.setTempFrame,
    setMaintainAspectRatio: props.setMaintainAspectRatio,
    setAspectRatio: props.setAspectRatio,
    setState: props.setState,
    setIsStepBadgePopoverOpen: props.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: props.setIsCalloutPopoverOpen,
    setIsCalloutEditing: props.setIsCalloutEditing,
    closePopover: props.closePopover,
    hideTooltip: props.hideTooltip,
    handleEffectButtonClick: props.handleEffectButtonClick,
    handleStartEditing: props.handleStartEditing,
    handleSave: props.handleSave,
    handleCancel: props.handleCancel,
    handleDelete: props.handleDelete,
  };
}

function getInteractiveFramePopoverProps(props: InteractiveFrameContentProps) {
  return {
    frame: props.currentFrame,
    currentFrame: props.currentFrame,
    isPopoverOpen: props.isPopoverOpen,
    isStepBadgePopoverOpen: props.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: props.isCalloutPopoverOpen,
    isCalloutEditing: props.isCalloutEditing,
    effectMode: props.effectMode,
    popoverAnchorRef: props.popoverAnchorRef,
    stepBadgePopoverAnchorRef: props.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: props.calloutPopoverAnchorRef,
    setIsStepBadgePopoverOpen: props.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: props.setIsCalloutPopoverOpen,
    setIsCalloutEditing: props.setIsCalloutEditing,
    setTempFrame: props.setTempFrame,
    closePopover: props.closePopover,
    frameZIndex: props.frameZIndex,
    onUpdate: props.onUpdate,
  };
}
