import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuickActionOverlay } from '../../../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../../../application/privileged-action-intent';

import { useCaptureActionState } from './capture-action';
import { usePendingAutoStartCaptureState } from './pending-auto-start';
import {
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
  writeContentPinToTabToolbarVisibilityState,
} from './pin-session';

function useContentPinToTabState() {
  const [pinToTab, setPinToTabState] = useState(readContentPinToTabSessionState);
  const [pinToTabAvailable, setPinToTabAvailable] = useState(false);
  const confirmedPinToTabRef = useRef(pinToTab);
  const refreshGenerationRef = useRef(0);
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
              refreshGenerationRef.current += 1;
              setPinToTabAvailable(result.pinToTabAvailable);
              commitPinToTabState(result.value);
            }
          }
        })
        .catch(() => {
          if (isCurrent()) {
            refreshGenerationRef.current += 1;
            commitPinToTabState(confirmedPinToTabRef.current);
          }
        });
    },
    [commitPinToTabState]
  );

  const refreshPinToTabState = useCallback(() => {
    const refreshGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = refreshGeneration;
    const startedAtGeneration = writeGenerationRef.current;

    void loadContentPinToTabSessionState().then((state) => {
      if (
        refreshGenerationRef.current !== refreshGeneration ||
        writeGenerationRef.current !== startedAtGeneration
      ) {
        return;
      }

      setPinToTabAvailable(state.pinToTabAvailable);
      commitConfirmedPinToTabState(state.pinToTab);
    });
  }, [commitConfirmedPinToTabState]);

  useEffect(() => {
    const handleFocus = () => refreshPinToTabState();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPinToTabState();
      }
    };

    refreshPinToTabState();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      refreshGenerationRef.current += 1;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshPinToTabState]);

  return { pinToTab, pinToTabAvailable, setPinToTab };
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
  const [isToolbarVisible, setToolbarVisibleState] = useState(false);
  const confirmedToolbarVisibilityRef = useRef(false);
  const visibilityWriteGenerationRef = useRef(0);
  const projectToolbarVisibility = useCallback((value: boolean) => {
    setToolbarVisibleState(value);
  }, []);
  const setIsToolbarVisible = useCallback(
    (value: boolean) => {
      confirmedToolbarVisibilityRef.current = value;
      projectToolbarVisibility(value);
    },
    [projectToolbarVisibility]
  );
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
  const { pinToTab, pinToTabAvailable, setPinToTab } = useContentPinToTabState();
  const setPinnedToolbarVisible = useCallback(
    (value: boolean) => {
      const writeGeneration = visibilityWriteGenerationRef.current + 1;
      visibilityWriteGenerationRef.current = writeGeneration;
      projectToolbarVisibility(value);
      void writeContentPinToTabToolbarVisibilityState(value)
        .then(() => {
          confirmedToolbarVisibilityRef.current = value;
        })
        .catch(() => {
          if (visibilityWriteGenerationRef.current === writeGeneration) {
            projectToolbarVisibility(confirmedToolbarVisibilityRef.current);
          }
        });
    },
    [projectToolbarVisibility]
  );
  const { quickActionOverlayRef, setQuickActionOverlay } = useQuickActionOverlayState();

  return {
    currentViewport,
    isCompletelyHidden,
    isToolbarVisible,
    navigationLockEnabled,
    pinToTab,
    pinToTabAvailable,
    quickActionOverlayRef,
    quickActionToastCountdown,
    saveDialogState,
    sessionActivePresetId,
    setCurrentViewport,
    setIsCompletelyHidden,
    setIsToolbarVisible,
    setNavigationLockEnabled,
    setPinnedToolbarVisible,
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
