import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { InteractiveFrameBlockingOverlays } from './blocking';
import { InteractiveFrameSizePanel } from '../size-panel';
import { InteractiveFrameToolbar } from '../toolbar';

export interface InteractiveFrameFloatingUiProps {
  frame: FrameData;
  frameId: string;
  state: FrameState;
  toolbarCoords: { x: number; y: number };
  sizePanelCoords: { x: number; y: number };
  tempFrame: FrameData;
  effectMode: EffectMode;
  isPopoverOpen: boolean;
  isFrameActive: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
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
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  closePopover: () => void;
  hideTooltip: (frameId: string) => void;
  handleEffectButtonClick: (mode: EffectMode) => void;
  handleStartEditing: () => void;
  handleSave: () => void;
  handleCancel: () => void;
  handleDelete: () => void;
}

/** Renders floating toolbar, size panel, and overlays for the interactive frame. */
export function InteractiveFrameFloatingUi(props: InteractiveFrameFloatingUiProps) {
  return (
    <>
      <InteractiveFrameToolbar {...getToolbarProps(props)} />
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
    popoverAnchorRef: props.popoverAnchorRef,
    stepBadgePopoverAnchorRef: props.stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef: props.calloutPopoverAnchorRef,
    setIsStepBadgePopoverOpen: props.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: props.setIsCalloutPopoverOpen,
    setIsCalloutEditing: props.setIsCalloutEditing,
    setState: props.setState,
    handleEffectButtonClick: props.handleEffectButtonClick,
    handleStartEditing: props.handleStartEditing,
    handleDelete: props.handleDelete,
    hideTooltip: props.hideTooltip,
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
    isPopoverOpen: props.isPopoverOpen,
    isStepBadgePopoverOpen: props.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: props.isCalloutPopoverOpen,
    isCalloutEditing: props.isCalloutEditing,
    closePopover: props.closePopover,
    hideTooltip: props.hideTooltip,
    frameId: props.frameId,
    setIsStepBadgePopoverOpen: props.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: props.setIsCalloutPopoverOpen,
    setIsCalloutEditing: props.setIsCalloutEditing,
  };
}
