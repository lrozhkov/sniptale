import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuickActionOverlay } from '../../../../../contracts/settings';

import { useCaptureActionState } from './capture-action';
import { usePendingAutoStartCaptureState } from './pending-auto-start';
import {
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
} from './pin-session';

function useContentPinToTabState() {
  const [pinToTab, setPinToTabState] = useState(readContentPinToTabSessionState);
  const writeGenerationRef = useRef(0);

  const setPinToTab = useCallback((value: boolean) => {
    const writeGeneration = writeGenerationRef.current + 1;
    writeGenerationRef.current = writeGeneration;
    writeContentPinToTabSessionState(value, () => writeGenerationRef.current === writeGeneration);
    setPinToTabState(value);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startedAtGeneration = writeGenerationRef.current;

    void loadContentPinToTabSessionState().then((value) => {
      if (!cancelled) {
        if (writeGenerationRef.current !== startedAtGeneration) {
          return;
        }

        setPinToTabState(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { pinToTab, setPinToTab };
}

function useQuickActionOverlayState() {
  const [, setQuickActionOverlayState] = useState<QuickActionOverlay | null>(null);
  const quickActionOverlayRef = useRef<QuickActionOverlay | null>(null);

  const setQuickActionOverlay = useCallback((overlay: QuickActionOverlay | null) => {
    quickActionOverlayRef.current = overlay;
    setQuickActionOverlayState(overlay);
  }, []);

  return { quickActionOverlayRef, setQuickActionOverlay };
}

function useContentVisibilityState() {
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [isCompletelyHidden, setIsCompletelyHidden] = useState(false);
  const [currentViewport, setCurrentViewport] = useState<{ width: number; height: number } | null>(
    null
  );
  const [navigationLockEnabled, setNavigationLockEnabled] = useState(false);
  const [quickActionToastCountdown, setQuickActionToastCountdown] = useState<number | null>(null);
  const [timerDelay, setTimerDelay] = useState(0);
  const [sessionActivePresetId, setSessionActivePresetId] = useState<string | null>(null);
  const [saveDialogState, setSaveDialogState] = useState<{
    dataUrl: string;
    filename: string;
  } | null>(null);
  const { pinToTab, setPinToTab } = useContentPinToTabState();
  const { quickActionOverlayRef, setQuickActionOverlay } = useQuickActionOverlayState();

  return {
    currentViewport,
    isCompletelyHidden,
    isToolbarVisible,
    navigationLockEnabled,
    pinToTab,
    quickActionOverlayRef,
    quickActionToastCountdown,
    saveDialogState,
    sessionActivePresetId,
    setCurrentViewport,
    setIsCompletelyHidden,
    setIsToolbarVisible,
    setNavigationLockEnabled,
    setPinToTab,
    setQuickActionOverlay,
    setQuickActionToastCountdown,
    setSaveDialogState,
    setSessionActivePresetId,
    setTimerDelay,
    timerDelay,
  };
}

export function useContentSurfaceState() {
  const autoStartState = usePendingAutoStartCaptureState();
  const captureActionState = useCaptureActionState();
  const visibilityState = useContentVisibilityState();

  return {
    ...captureActionState,
    ...visibilityState,
    clearPendingAutoStartCapture: autoStartState.clearPendingAutoStartCapture,
    pendingAutoStartCapture: autoStartState.pendingAutoStartCapture,
    queueAutoStartCapture: autoStartState.queueAutoStartCapture,
  };
}
