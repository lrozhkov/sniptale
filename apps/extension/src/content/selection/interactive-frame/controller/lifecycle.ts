import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  useInteractiveFrameEditingKeyboardEffect,
  useInteractiveFrameEditingOverlayEffect,
  useInteractiveFrameIdleReset,
} from './edit-mode-effects';
import {
  addExitFrameEditingListener,
  addHighlighterModeChangedListener,
} from '../../../platform/page-context/mode-events';
import {
  addPagePreparationHistoryAppliedListener,
  pagePreparationHistory,
} from '../../../parser/page-preparation/history';

function cancelFrameHistoryTransactions(frameId: string) {
  [
    `callout-editing:${frameId}`,
    `callout-settings:${frameId}`,
    `frame-settings:${frameId}`,
    `step-badge:${frameId}`,
  ].forEach((key) => {
    pagePreparationHistory.cancelTransaction(key);
  });
}

function clearPendingHistorySync(syncTimerRef: React.MutableRefObject<number | null>) {
  if (syncTimerRef.current === null) {
    return;
  }

  window.clearTimeout(syncTimerRef.current);
  syncTimerRef.current = null;
}

function scheduleHistoryApplySync(args: {
  defaultEffectModeRef: React.MutableRefObject<EffectMode>;
  frameRef: React.MutableRefObject<FrameData>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  syncTimerRef: React.MutableRefObject<number | null>;
}) {
  clearPendingHistorySync(args.syncTimerRef);
  args.syncTimerRef.current = window.setTimeout(() => {
    args.syncTimerRef.current = null;
    const syncedFrame = args.frameRef.current;
    args.setEffectMode(syncedFrame.effectMode ?? args.defaultEffectModeRef.current ?? 'border');
    args.setTempFrame(syncedFrame);
  }, 0);
}

function useHistoryApplyFrameRefs(frame: FrameData, defaultEffectMode: EffectMode) {
  const frameRef = React.useRef(frame);
  const defaultEffectModeRef = React.useRef(defaultEffectMode);

  React.useEffect(() => {
    frameRef.current = frame;
    defaultEffectModeRef.current = defaultEffectMode;
  }, [defaultEffectMode, frame]);

  return { defaultEffectModeRef, frameRef };
}

function useHistoryApplyCleanup(syncTimerRef: React.MutableRefObject<number | null>) {
  React.useEffect(() => {
    return () => {
      clearPendingHistorySync(syncTimerRef);
    };
  }, [syncTimerRef]);
}

export function useInteractiveFrameStateSync(params: {
  state: FrameState;
  onStateChange?: (state: FrameState) => void;
}) {
  const onStateChangeRef = React.useRef(params.onStateChange);
  const prevStateRef = React.useRef<FrameState>(params.state);

  React.useEffect(() => {
    onStateChangeRef.current = params.onStateChange;
  }, [params.onStateChange]);

  React.useEffect(() => {
    if (prevStateRef.current === params.state) {
      return;
    }
    prevStateRef.current = params.state;
    onStateChangeRef.current?.(params.state);
  }, [params.state]);
}

export function useInteractiveFrameTooltipSync(params: {
  isTooltipVisible: boolean;
  state: FrameState;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
}) {
  const { isTooltipVisible, state, isStepBadgePopoverOpen, isCalloutPopoverOpen, setState } =
    params;
  React.useEffect(() => {
    if (isTooltipVisible && state === 'idle') {
      setState('hover');
    } else if (
      !isTooltipVisible &&
      state === 'hover' &&
      !isStepBadgePopoverOpen &&
      !isCalloutPopoverOpen
    ) {
      setState('idle');
    }
  }, [isTooltipVisible, state, isStepBadgePopoverOpen, isCalloutPopoverOpen, setState]);
}

export function useInteractiveFramePropSync(params: {
  defaultEffectMode: EffectMode;
  frame: FrameData;
  isCalloutEditing: boolean;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  state: FrameState;
}) {
  const { defaultEffectMode, frame, isCalloutEditing, setEffectMode, setTempFrame, state } = params;

  React.useEffect(() => {
    if (state === 'editing' || isCalloutEditing) {
      return;
    }

    setEffectMode(frame.effectMode ?? defaultEffectMode);
    setTempFrame(frame);
  }, [defaultEffectMode, frame, isCalloutEditing, setEffectMode, setTempFrame, state]);
}

export function useInteractiveFrameEditingEffects(params: {
  state: FrameState;
  isCalloutEditing: boolean;
  frameWithoutLinkedElement: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleCancelRef: React.MutableRefObject<() => void>;
  handleSaveRef: React.MutableRefObject<() => void>;
  handleDeleteRef: React.MutableRefObject<() => void>;
}) {
  useInteractiveFrameIdleReset(params);
  useInteractiveFrameEditingOverlayEffect(params.state, params.isCalloutEditing);
  useInteractiveFrameEditingKeyboardEffect(params);
}

export function useInteractiveFrameExternalExitEffects(params: {
  state: FrameState;
  handleCancel: () => void;
}) {
  const { state, handleCancel } = params;
  React.useEffect(() => {
    const handleExitEditing = () => {
      if (state === 'editing') {
        handleCancel();
      }
    };

    return addExitFrameEditingListener(handleExitEditing);
  }, [state, handleCancel]);

  React.useEffect(() => {
    const handleHighlighterDisabled = (enabled: boolean) => {
      if (!enabled && state === 'editing') {
        handleCancel();
      }
    };

    return addHighlighterModeChangedListener(({ enabled }) => {
      handleHighlighterDisabled(enabled);
    });
  }, [state, handleCancel]);
}

export function useInteractiveFrameHistoryApplyReset(params: {
  defaultEffectMode: EffectMode;
  frame: FrameData;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
}) {
  const {
    defaultEffectMode,
    frame,
    setEffectMode,
    setIsCalloutEditing,
    setIsCalloutPopoverOpen,
    setIsStepBadgePopoverOpen,
    setState,
    setTempFrame,
  } = params;
  const { defaultEffectModeRef, frameRef } = useHistoryApplyFrameRefs(frame, defaultEffectMode);
  const syncTimerRef = React.useRef<number | null>(null);
  useHistoryApplyCleanup(syncTimerRef);

  React.useEffect(() => {
    return addPagePreparationHistoryAppliedListener(() => {
      cancelFrameHistoryTransactions(frameRef.current.id);
      setState('idle');
      setIsCalloutEditing(false);
      setIsCalloutPopoverOpen(false);
      setIsStepBadgePopoverOpen(false);
      scheduleHistoryApplySync({
        defaultEffectModeRef,
        frameRef,
        setEffectMode,
        setTempFrame,
        syncTimerRef,
      });
    });
  }, [
    setEffectMode,
    setIsCalloutEditing,
    setIsCalloutPopoverOpen,
    setIsStepBadgePopoverOpen,
    setState,
    setTempFrame,
    defaultEffectModeRef,
    frameRef,
  ]);
}
