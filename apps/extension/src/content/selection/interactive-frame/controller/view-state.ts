import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  consumeFrameCalloutEditRequest,
  useFrameUIStore,
} from '../../frame-runtime/state/frame-ui.store';
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
  const [isCalloutEditing, setIsCalloutEditing] = React.useState(() =>
    consumeFrameCalloutEditRequest(params.frame.id)
  );
  const [activeCalloutIndex, setActiveCalloutIndex] = React.useState(0);
  const [tempFrame, setTempFrame] = React.useState<FrameData>(params.frame);
  const authoritativeFrameRef = React.useRef(params.frame);
  authoritativeFrameRef.current = params.frame;
  const tempFrameRef = React.useRef(tempFrame);
  tempFrameRef.current = tempFrame;
  const pendingCalloutFrameRef = React.useRef<FrameData | null>(null);
  const pendingCalloutTimeoutRef = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (pendingCalloutTimeoutRef.current !== null)
        window.clearTimeout(pendingCalloutTimeoutRef.current);
    },
    []
  );
  const stageCalloutFrame = React.useCallback(
    (update: FrameData | ((frame: FrameData) => FrameData)) => {
      const nextFrame = typeof update === 'function' ? update(tempFrameRef.current) : update;
      tempFrameRef.current = nextFrame;
      pendingCalloutFrameRef.current = nextFrame;
      setTempFrame(nextFrame);
      if (pendingCalloutTimeoutRef.current !== null)
        window.clearTimeout(pendingCalloutTimeoutRef.current);
      pendingCalloutTimeoutRef.current = window.setTimeout(() => {
        pendingCalloutTimeoutRef.current = null;
        if (pendingCalloutFrameRef.current !== nextFrame) return;
        pendingCalloutFrameRef.current = null;
        tempFrameRef.current = authoritativeFrameRef.current;
        setTempFrame(authoritativeFrameRef.current);
      }, 2_000);
      return nextFrame;
    },
    []
  );
  const [effectMode, setEffectMode] = React.useState<EffectMode>(
    params.frame.effectMode || params.defaultEffectMode
  );
  const [maintainAspectRatio, setMaintainAspectRatio] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState<number | null>(null);

  return {
    aspectRatio,
    activeCalloutIndex,
    effectMode,
    isCalloutEditing,
    maintainAspectRatio,
    pendingCalloutFrameRef,
    setAspectRatio,
    setActiveCalloutIndex,
    setEffectMode,
    setIsCalloutEditing,
    setMaintainAspectRatio,
    setState,
    setTempFrame,
    stageCalloutFrame,
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
  activeCalloutIndex: number;
  aspectRatio: number | null;
  effectMode: EffectMode;
  isCalloutEditing: boolean;
  maintainAspectRatio: boolean;
  pendingCalloutFrameRef: React.MutableRefObject<FrameData | null>;
  state: FrameState;
  tempFrame: FrameData;
}) {
  return {
    activeCalloutIndex: params.activeCalloutIndex,
    state: params.state,
    isCalloutEditing: params.isCalloutEditing,
    tempFrame: params.tempFrame,
    effectMode: params.effectMode,
    maintainAspectRatio: params.maintainAspectRatio,
    aspectRatio: params.aspectRatio,
    pendingCalloutFrameRef: params.pendingCalloutFrameRef,
  };
}

function createInteractiveFrameLocalSetters(params: {
  setActiveCalloutIndex: React.Dispatch<React.SetStateAction<number>>;
  setAspectRatio: React.Dispatch<React.SetStateAction<number | null>>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setMaintainAspectRatio: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  stageCalloutFrame: (update: FrameData | ((frame: FrameData) => FrameData)) => FrameData;
}) {
  return {
    setActiveCalloutIndex: params.setActiveCalloutIndex,
    setState: params.setState,
    setIsCalloutEditing: params.setIsCalloutEditing,
    setTempFrame: params.setTempFrame,
    stageCalloutFrame: params.stageCalloutFrame,
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
