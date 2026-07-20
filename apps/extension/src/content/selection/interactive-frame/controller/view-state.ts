import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import type { FrameUIState } from '../../frame-runtime/state/frame-ui.store.types';

export function useInteractiveFrameViewState(params: {
  frame: FrameData;
  defaultEffectMode: EffectMode;
}) {
  const local = useInteractiveFrameLocalState(params);
  const store = useInteractiveFrameStoreState();

  return {
    ...createInteractiveFrameLocalState(local),
    ...createInteractiveFrameLocalSetters(local),
    ...createInteractiveFrameStoreState(store),
  };
}

function useInteractiveFrameLocalState(params: {
  frame: FrameData;
  defaultEffectMode: EffectMode;
}) {
  const [state, setState] = React.useState<FrameState>('idle');
  const [isStepBadgePopoverOpen, setIsStepBadgePopoverOpen] = React.useState(false);
  const [isCalloutPopoverOpen, setIsCalloutPopoverOpen] = React.useState(false);
  const [isCalloutEditing, setIsCalloutEditing] = React.useState(false);
  const [tempFrame, setTempFrame] = React.useState<FrameData>(params.frame);
  const [effectMode, setEffectMode] = React.useState<EffectMode>(
    params.frame.effectMode || params.defaultEffectMode
  );
  const [maintainAspectRatio, setMaintainAspectRatio] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState<number | null>(null);

  return {
    aspectRatio,
    effectMode,
    isCalloutEditing,
    isCalloutPopoverOpen,
    isStepBadgePopoverOpen,
    maintainAspectRatio,
    setAspectRatio,
    setEffectMode,
    setIsCalloutEditing,
    setIsCalloutPopoverOpen,
    setIsStepBadgePopoverOpen,
    setMaintainAspectRatio,
    setState,
    setTempFrame,
    state,
    tempFrame,
  };
}

function useInteractiveFrameStoreState() {
  const activeFrameId = useFrameUIStore((s) => s.activeFrameId);
  const popoverFrameId = useFrameUIStore((s) => s.popoverFrameId);
  const openPopover = useFrameUIStore((s) => s.openPopover);
  const closePopover = useFrameUIStore((s) => s.closePopover);
  const hideTooltip = useFrameUIStore((s) => s.hideTooltip);

  return {
    activeFrameId,
    closePopover,
    hideTooltip,
    openPopover,
    popoverFrameId,
  };
}

function createInteractiveFrameLocalState(params: {
  aspectRatio: number | null;
  effectMode: EffectMode;
  isCalloutEditing: boolean;
  isCalloutPopoverOpen: boolean;
  isStepBadgePopoverOpen: boolean;
  maintainAspectRatio: boolean;
  state: FrameState;
  tempFrame: FrameData;
}) {
  return {
    state: params.state,
    isStepBadgePopoverOpen: params.isStepBadgePopoverOpen,
    isCalloutPopoverOpen: params.isCalloutPopoverOpen,
    isCalloutEditing: params.isCalloutEditing,
    tempFrame: params.tempFrame,
    effectMode: params.effectMode,
    maintainAspectRatio: params.maintainAspectRatio,
    aspectRatio: params.aspectRatio,
  };
}

function createInteractiveFrameLocalSetters(params: {
  setAspectRatio: React.Dispatch<React.SetStateAction<number | null>>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMaintainAspectRatio: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
}) {
  return {
    setState: params.setState,
    setIsStepBadgePopoverOpen: params.setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen: params.setIsCalloutPopoverOpen,
    setIsCalloutEditing: params.setIsCalloutEditing,
    setTempFrame: params.setTempFrame,
    setEffectMode: params.setEffectMode,
    setMaintainAspectRatio: params.setMaintainAspectRatio,
    setAspectRatio: params.setAspectRatio,
  };
}

function createInteractiveFrameStoreState(params: {
  activeFrameId: string | null;
  closePopover: FrameUIState['closePopover'];
  hideTooltip: FrameUIState['hideTooltip'];
  openPopover: FrameUIState['openPopover'];
  popoverFrameId: string | null;
}) {
  return {
    activeFrameId: params.activeFrameId,
    popoverFrameId: params.popoverFrameId,
    openPopover: params.openPopover,
    closePopover: params.closePopover,
    hideTooltip: params.hideTooltip,
  };
}
