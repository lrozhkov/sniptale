import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import type { FrameUIState } from '../../frame-runtime/state/frame-ui.store';

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
    maintainAspectRatio,
    setAspectRatio,
    setEffectMode,
    setIsCalloutEditing,
    setMaintainAspectRatio,
    setState,
    setTempFrame,
    state,
    tempFrame,
  };
}

function useInteractiveFrameStoreState() {
  const hoveredFrameId = useFrameUIStore((s) => s.hoveredFrameId);
  const selectedFrameId = useFrameUIStore((s) => s.selectedFrameId);
  const toolbarAnchorOffset = useFrameUIStore((s) => s.toolbarAnchorOffset);
  const activePopover = useFrameUIStore((s) => s.activePopover);
  const resizeFrameId = useFrameUIStore((s) => s.resizeFrameId);
  const togglePopover = useFrameUIStore((s) => s.togglePopover);
  const closePopover = useFrameUIStore((s) => s.closePopover);
  const hoverFrame = useFrameUIStore((s) => s.hoverFrame);
  const scheduleHoverFrameHide = useFrameUIStore((s) => s.scheduleHoverFrameHide);
  const selectFrame = useFrameUIStore((s) => s.selectFrame);
  const clearSelection = useFrameUIStore((s) => s.clearSelection);

  return {
    hoveredFrameId,
    selectedFrameId,
    toolbarAnchorOffset,
    closePopover,
    hoverFrame,
    scheduleHoverFrameHide,
    selectFrame,
    clearSelection,
    activePopover,
    togglePopover,
    resizeFrameId,
  };
}

function createInteractiveFrameLocalState(params: {
  aspectRatio: number | null;
  effectMode: EffectMode;
  isCalloutEditing: boolean;
  maintainAspectRatio: boolean;
  state: FrameState;
  tempFrame: FrameData;
}) {
  return {
    state: params.state,
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
  setMaintainAspectRatio: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
}) {
  return {
    setState: params.setState,
    setIsCalloutEditing: params.setIsCalloutEditing,
    setTempFrame: params.setTempFrame,
    setEffectMode: params.setEffectMode,
    setMaintainAspectRatio: params.setMaintainAspectRatio,
    setAspectRatio: params.setAspectRatio,
  };
}

function createInteractiveFrameStoreState(params: {
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
  toolbarAnchorOffset: { x: number; y: number } | null;
  closePopover: FrameUIState['closePopover'];
  hoverFrame: FrameUIState['hoverFrame'];
  scheduleHoverFrameHide: FrameUIState['scheduleHoverFrameHide'];
  selectFrame: FrameUIState['selectFrame'];
  clearSelection: FrameUIState['clearSelection'];
  activePopover: FrameUIState['activePopover'];
  togglePopover: FrameUIState['togglePopover'];
  resizeFrameId: string | null;
}) {
  return {
    hoveredFrameId: params.hoveredFrameId,
    selectedFrameId: params.selectedFrameId,
    toolbarAnchorOffset: params.toolbarAnchorOffset,
    activePopover: params.activePopover,
    resizeFrameId: params.resizeFrameId,
    togglePopover: params.togglePopover,
    closePopover: params.closePopover,
    hoverFrame: params.hoverFrame,
    scheduleHoverFrameHide: params.scheduleHoverFrameHide,
    selectFrame: params.selectFrame,
    clearSelection: params.clearSelection,
  };
}
