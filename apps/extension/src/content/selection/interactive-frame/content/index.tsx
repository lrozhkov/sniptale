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
  fillStyle: React.CSSProperties;
  strokeStyle: React.CSSProperties;
  borderColor: string;
  borderWidth: number;
  borderShadow?: NonNullable<FrameData['borderSettings']>['shadow'];
  isResizeHovered: boolean;
  handleMouseDown: (event: React.PointerEvent) => void;
  handleResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
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
    isFrameActive: props.isFrameActive,
    isHovered: props.isHovered,
    isSelected: props.isSelected,
    toolbarAnchorOffset: props.toolbarAnchorOffset,
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
    togglePopover: props.togglePopover,
    setIsCalloutEditing: props.setIsCalloutEditing,
    closePopover: props.closePopover,
    ...(props.handleEffectModeSelect === undefined
      ? {}
      : { handleEffectModeSelect: props.handleEffectModeSelect }),
    hoverFrame: props.hoverFrame,
    scheduleHoverFrameHide: props.scheduleHoverFrameHide,
    selectFrame: props.selectFrame,
    clearSelection: props.clearSelection,
    handleEffectButtonClick: props.handleEffectButtonClick,
    handleStartEditing: props.handleStartEditing,
    handleSave: props.handleSave,
    handleCancel: props.handleCancel,
    handleDelete: props.handleDelete,
    onUpdate: props.onUpdate,
  };
}

function getInteractiveFramePopoverProps(props: InteractiveFrameContentProps) {
  return {
    frame: props.currentFrame,
    currentFrame: props.currentFrame,
    isPopoverOpen: props.isPopoverOpen,
    isSelected: props.isSelected,
    isStepBadgePopoverOpen: props.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: props.isCalloutPopoverOpen,
    isCalloutEditing: props.isCalloutEditing,
    state: props.state,
    effectMode: props.effectMode,
    popoverAnchorRef: props.popoverAnchorRef,
    stepBadgePopoverAnchorRef: props.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: props.calloutPopoverAnchorRef,
    setIsCalloutEditing: props.setIsCalloutEditing,
    setTempFrame: props.setTempFrame,
    closePopover: props.closePopover,
    ...(props.handleEffectModeSelect === undefined
      ? {}
      : { handleEffectModeSelect: props.handleEffectModeSelect }),
    frameZIndex: props.frameZIndex,
    onUpdate: props.onUpdate,
  };
}
