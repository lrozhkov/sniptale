import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuickActionOverlay } from '../../../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../../../application/privileged-action-intent';

import { useCaptureActionState } from './capture-action';
import { usePendingAutoStartCaptureState } from './pending-auto-start';
import {
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
} from './pin-session';

function useContentPinToTabState() {
  const [pinToTab, setPinToTabState] = useState(readContentPinToTabSessionState);
  const confirmedPinToTabRef = useRef(pinToTab);
  const writeGenerationRef = useRef(0);

  const commitPinToTabState = useCallback((value: boolean) => {
    setPinToTabState(value);
  }, []);

  const commitConfirmedPinToTabState = useCallback(
    (value: boolean) => {
      confirmedPinToTabRef.current = value;
      commitPinToTabState(value);
    },
    [commitPinToTabState]
  );

  const setPinToTab = useCallback(
    (value: boolean, contentIntentSource?: ContentPrivilegedActionIntentSource) => {
      const writeGeneration = writeGenerationRef.current + 1;
      writeGenerationRef.current = writeGeneration;
      const isCurrent = () => writeGenerationRef.current === writeGeneration;

      commitPinToTabState(value);
      void writeContentPinToTabSessionState(value, isCurrent, contentIntentSource)
        .then((result) => {
          if (result.status === 'acknowledged') {
            confirmedPinToTabRef.current = result.value;
            if (isCurrent()) {
              commitPinToTabState(result.value);
            }
          }
        })
        .catch(() => {
          if (isCurrent()) {
            commitPinToTabState(confirmedPinToTabRef.current);
          }
        });
    },
    [commitPinToTabState]
  );

  useEffect(() => {
    let cancelled = false;

    const startedAtGeneration = writeGenerationRef.current;

    void loadContentPinToTabSessionState().then((value) => {
      if (!cancelled) {
        if (writeGenerationRef.current !== startedAtGeneration) {
          return;
        }

        commitConfirmedPinToTabState(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [commitConfirmedPinToTabState]);

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
