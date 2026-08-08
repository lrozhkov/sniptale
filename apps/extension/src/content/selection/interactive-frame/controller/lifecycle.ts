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
import { createCalloutRenderKey } from '../../../../features/highlighter/frame-annotation/callout/model';

function createFrameCalloutCollectionKey(frame: FrameData): string {
  return [frame.callout, ...(frame.additionalCallouts ?? [])]
    .map((callout) => createCalloutRenderKey(callout))
    .join('\n');
}

function preservePendingCallouts(frame: FrameData, pending: FrameData): FrameData {
  const {
    callout: _currentCallout,
    additionalCallouts: _currentAdditionalCallouts,
    ...frameWithoutCallouts
  } = frame;
  return {
    ...frameWithoutCallouts,
    ...(pending.callout === undefined ? {} : { callout: pending.callout }),
    ...(pending.additionalCallouts === undefined
      ? {}
      : { additionalCallouts: pending.additionalCallouts }),
  };
}

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
  isChromeVisible: boolean;
  state: FrameState;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
}) {
  const { isChromeVisible, state, isStepBadgePopoverOpen, isCalloutPopoverOpen, setState } = params;
  React.useEffect(() => {
    if (isChromeVisible && state === 'idle') {
      setState('hover');
    } else if (
      !isChromeVisible &&
      state === 'hover' &&
      !isStepBadgePopoverOpen &&
      !isCalloutPopoverOpen
    ) {
      setState('idle');
    }
  }, [isChromeVisible, state, isStepBadgePopoverOpen, isCalloutPopoverOpen, setState]);
}

export function useInteractiveFramePropSync(params: {
  defaultEffectMode: EffectMode;
  frame: FrameData;
  isCalloutEditing: boolean;
  isResizingRef: React.MutableRefObject<boolean>;
  pendingCalloutFrameRef?: React.MutableRefObject<FrameData | null>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  state: FrameState;
}) {
  const {
    defaultEffectMode,
    frame,
    isCalloutEditing,
    isResizingRef,
    pendingCalloutFrameRef,
    setEffectMode,
    setState,
    setTempFrame,
    state,
  } = params;

  React.useEffect(() => {
    if (state === 'editing') {
      return;
    }
    const pendingCalloutFrame = pendingCalloutFrameRef?.current;
    if (pendingCalloutFrame) {
      if (
        createFrameCalloutCollectionKey(frame) ===
        createFrameCalloutCollectionKey(pendingCalloutFrame)
      ) {
        if (pendingCalloutFrameRef) pendingCalloutFrameRef.current = null;
        setTempFrame(frame);
      } else {
        setTempFrame(preservePendingCallouts(frame, pendingCalloutFrame));
      }
      return;
    }
    if (isCalloutEditing) {
      setTempFrame((current) => {
        const enabledPrimaryCallout = frame.callout?.enabled ? frame.callout : undefined;
        if (!enabledPrimaryCallout || current.callout?.enabled) return current;
        return { ...current, callout: enabledPrimaryCallout };
      });
      return;
    }
    if (state === 'resizing' && isResizingRef.current) return;

    setEffectMode(frame.effectMode ?? defaultEffectMode);
    setTempFrame(frame);
    if (state === 'resizing') setState('hover');
  }, [
    defaultEffectMode,
    frame,
    isCalloutEditing,
    isResizingRef,
    pendingCalloutFrameRef,
    setEffectMode,
    setState,
    setTempFrame,
    state,
  ]);
}

export function useInteractiveFrameEditingEffects(params: {
  state: FrameState;
  isCalloutEditing: boolean;
  frameWithoutLinkedElement: FrameData;
  pendingCalloutFrameRef?: React.MutableRefObject<FrameData | null>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
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
  abortPointerSession: () => boolean;
  pendingCalloutFrameRef?: React.MutableRefObject<FrameData | null>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
}) {
  const { state, handleCancel, abortPointerSession, pendingCalloutFrameRef, setState } = params;
  React.useEffect(() => {
    const handleExitEditing = () => {
      if (pendingCalloutFrameRef) pendingCalloutFrameRef.current = null;
      const abortedPointerSession = abortPointerSession();
      if (state === 'editing') {
        handleCancel();
      } else if (abortedPointerSession) {
        setState('idle');
      }
    };

    return addExitFrameEditingListener(handleExitEditing);
  }, [state, handleCancel, abortPointerSession, pendingCalloutFrameRef, setState]);

  React.useEffect(() => {
    const handleHighlighterDisabled = (enabled: boolean) => {
      if (enabled) return;
      if (pendingCalloutFrameRef) pendingCalloutFrameRef.current = null;
      const abortedPointerSession = abortPointerSession();
      if (state === 'editing') handleCancel();
      else if (abortedPointerSession) setState('idle');
    };

    return addHighlighterModeChangedListener(({ enabled }) => {
      handleHighlighterDisabled(enabled);
    });
  }, [state, handleCancel, abortPointerSession, pendingCalloutFrameRef, setState]);
}

export function useInteractiveFrameHistoryApplyReset(params: {
  abortPointerSession: () => boolean;
  defaultEffectMode: EffectMode;
  frame: FrameData;
  pendingCalloutFrameRef?: React.MutableRefObject<FrameData | null>;
  closePopover: () => void;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
}) {
  const {
    abortPointerSession,
    closePopover,
    defaultEffectMode,
    frame,
    pendingCalloutFrameRef,
    setEffectMode,
    setIsCalloutEditing,
    setState,
    setTempFrame,
  } = params;
  const { defaultEffectModeRef, frameRef } = useHistoryApplyFrameRefs(frame, defaultEffectMode);
  const syncTimerRef = React.useRef<number | null>(null);
  useHistoryApplyCleanup(syncTimerRef);

  React.useEffect(() => {
    return addPagePreparationHistoryAppliedListener(() => {
      if (pendingCalloutFrameRef) pendingCalloutFrameRef.current = null;
      abortPointerSession();
      cancelFrameHistoryTransactions(frameRef.current.id);
      setState('idle');
      setIsCalloutEditing(false);
      closePopover();
      scheduleHistoryApplySync({
        defaultEffectModeRef,
        frameRef,
        setEffectMode,
        setTempFrame,
        syncTimerRef,
      });
    });
  }, [
    abortPointerSession,
    closePopover,
    setEffectMode,
    setIsCalloutEditing,
    setState,
    setTempFrame,
    defaultEffectModeRef,
    frameRef,
    pendingCalloutFrameRef,
  ]);
}
