import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { InteractiveFrameBlockingOverlays } from './blocking';
import { InteractiveFrameSizePanel } from '../size-panel';
import { InteractiveFrameToolbar } from '../toolbar';
import { InteractiveFrameToolbarTrigger } from '../toolbar/trigger';

export interface InteractiveFrameFloatingUiProps {
  frame: FrameData;
  frameId: string;
  state: FrameState;
  toolbarCoords: { x: number; y: number };
  sizePanelCoords: { x: number; y: number };
  tempFrame: FrameData;
  effectMode: EffectMode;
  isFrameActive: boolean;
  isHovered: boolean;
  isSelected: boolean;
  toolbarAnchorOffset: { x: number; y: number } | null;
  isCalloutEditing: boolean;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setMaintainAspectRatio: React.Dispatch<React.SetStateAction<boolean>>;
  setAspectRatio: React.Dispatch<React.SetStateAction<number | null>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  togglePopover: (
    frameId: string,
    kind: 'frame-settings' | 'step-badge' | 'callout-settings'
  ) => void;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  closePopover: () => void;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
  clearSelection: () => void;
  handleEffectButtonClick: (mode: EffectMode) => void;
  handleStartEditing: () => void;
  handleSave: () => void;
  handleCancel: () => void;
  handleDelete: () => void;
  onUpdate: (frame: FrameData) => void;
}

/** Renders floating toolbar, size panel, and overlays for the interactive frame. */
export function InteractiveFrameFloatingUi(props: InteractiveFrameFloatingUiProps) {
  return (
    <>
      <InteractiveFrameToolbar {...getToolbarProps(props)} />
      <InteractiveFrameToolbarTrigger {...getTriggerProps(props)} />
      <InteractiveFrameSizePanel {...getSizePanelProps(props)} />
      <InteractiveFrameBlockingOverlays {...getOverlayProps(props)} />
    </>
  );
}

function getToolbarProps(props: InteractiveFrameFloatingUiProps) {
  return {
    state: props.state,
    toolbarCoords: props.toolbarCoords,
    effectMode: props.effectMode,
    frame: props.frame,
    isSelected: props.isSelected,
    toolbarAnchorOffset: props.toolbarAnchorOffset,
    isCalloutEditing: props.isCalloutEditing,
    popoverAnchorRef: props.popoverAnchorRef,
    stepBadgePopoverAnchorRef: props.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: props.calloutPopoverAnchorRef,
    clearSelection: props.clearSelection,
    closePopover: props.closePopover,
    togglePopover: props.togglePopover,
    setIsCalloutEditing: props.setIsCalloutEditing,
    setState: props.setState,
    handleEffectButtonClick: props.handleEffectButtonClick,
    handleStartEditing: props.handleStartEditing,
    handleDelete: props.handleDelete,
    onUpdate: props.onUpdate,
  };
}

function getTriggerProps(props: InteractiveFrameFloatingUiProps) {
  return {
    frame: props.frame,
    isVisible:
      props.isHovered && !props.isSelected && (props.state === 'idle' || props.state === 'hover'),
    closePopover: props.closePopover,
    handleStartEditing: props.handleStartEditing,
    hoverFrame: props.hoverFrame,
    popoverAnchorRef: props.popoverAnchorRef,
    scheduleHoverFrameHide: props.scheduleHoverFrameHide,
    selectFrame: props.selectFrame,
    setIsCalloutEditing: props.setIsCalloutEditing,
    setState: props.setState,
  };
}

function getSizePanelProps(props: InteractiveFrameFloatingUiProps) {
  return {
    state: props.state,
    sizePanelCoords: props.sizePanelCoords,
    tempFrame: props.tempFrame,
    setTempFrame: props.setTempFrame,
    maintainAspectRatio: props.maintainAspectRatio,
    setMaintainAspectRatio: props.setMaintainAspectRatio,
    aspectRatio: props.aspectRatio,
    setAspectRatio: props.setAspectRatio,
    effectMode: props.effectMode,
    frameId: props.frameId,
    handleSave: props.handleSave,
    handleCancel: props.handleCancel,
  };
}

function getOverlayProps(props: InteractiveFrameFloatingUiProps) {
  return {
    state: props.state,
    tempFrame: props.tempFrame,
    isFrameActive: props.isFrameActive,
    isCalloutEditing: props.isCalloutEditing,
    clearSelection: props.clearSelection,
    frameId: props.frameId,
    setIsCalloutEditing: props.setIsCalloutEditing,
  };
}
