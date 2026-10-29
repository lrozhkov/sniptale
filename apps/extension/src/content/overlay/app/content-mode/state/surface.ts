import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuickActionOverlay } from '../../../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../../../application/privileged-action-intent';

import { useCaptureActionState } from './capture-action';
import { usePendingAutoStartCaptureState } from './pending-auto-start';
import {
  type ContentPinToTabSessionState,
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
  writeContentPinToTabToolbarVisibilityState,
} from './pin-session';

function useContentPinToTabState(
  restoreToolbarVisibility: (visible: boolean) => void,
  createToolbarVisibilityRefreshGuard: () => () => boolean
) {
  const [pinToTab, setPinToTabState] = useState(readContentPinToTabSessionState);
  const [pinToTabAvailable, setPinToTabAvailable] = useState(false);
  const [pinToTabConfirmed, setPinToTabConfirmed] = useState(pinToTab);
  const [automaticPinConfirmed, setAutomaticPinConfirmed] = useState(false);
  const confirmedPinToTabRef = useRef(pinToTab);
  const confirmedAutomaticPinRef = useRef(false);
  const refreshGenerationRef = useRef(0);
  const writeGenerationRef = useRef(0);

  const commitPinToTabState = useCallback((value: boolean) => {
    setPinToTabState(value);
  }, []);

  const commitConfirmedPinToTabState = useCallback(
    (value: boolean, automatic = false) => {
      confirmedPinToTabRef.current = value;
      confirmedAutomaticPinRef.current = automatic;
      setPinToTabConfirmed(value);
      setAutomaticPinConfirmed(value && automatic);
      commitPinToTabState(value);
    },
    [commitPinToTabState]
  );

  const setPinToTab = useCallback(
    async (
      value: boolean,
      contentIntentSource?: ContentPrivilegedActionIntentSource
    ): Promise<boolean> => {
      const writeGeneration = writeGenerationRef.current + 1;
      writeGenerationRef.current = writeGeneration;
      const isCurrent = () => writeGenerationRef.current === writeGeneration;

      commitPinToTabState(value);
      return writeContentPinToTabSessionState(value, isCurrent, contentIntentSource)
        .then((result) => {
          if (result.status === 'acknowledged') {
            if (isCurrent()) {
              confirmedPinToTabRef.current = result.value;
              confirmedAutomaticPinRef.current = false;
              refreshGenerationRef.current += 1;
              setPinToTabAvailable(result.pinToTabAvailable);
              setPinToTabConfirmed(result.value);
              setAutomaticPinConfirmed(false);
              commitPinToTabState(result.value);
            }
          }
          return isCurrent() && result.status === 'acknowledged' && result.value === value;
        })
        .catch(() => {
          if (isCurrent()) {
            refreshGenerationRef.current += 1;
            setPinToTabConfirmed(confirmedPinToTabRef.current);
            setAutomaticPinConfirmed(
              confirmedPinToTabRef.current && confirmedAutomaticPinRef.current
            );
            commitPinToTabState(confirmedPinToTabRef.current);
          }
          return false;
        });
    },
    [commitPinToTabState]
  );

  const refreshPinToTabState = useCallback(() => {
    const refreshGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = refreshGeneration;
    const startedAtGeneration = writeGenerationRef.current;
    const isToolbarVisibilityRefreshCurrent = createToolbarVisibilityRefreshGuard();

    void loadContentPinToTabSessionState().then((state) => {
      if (
        refreshGenerationRef.current !== refreshGeneration ||
        writeGenerationRef.current !== startedAtGeneration ||
        !isToolbarVisibilityRefreshCurrent()
      ) {
        return;
      }

      setPinToTabAvailable(state.pinToTabAvailable);
      commitConfirmedPinToTabState(state.pinToTab, state.pinToTabAutomatic);
      if (state.pinToTab && isToolbarVisibilityRefreshCurrent()) {
        restoreToolbarVisibility(state.toolbarVisible);
      }
    });
  }, [commitConfirmedPinToTabState, createToolbarVisibilityRefreshGuard, restoreToolbarVisibility]);

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

  const createPinSessionCommit = useCallback(() => {
    const generation = writeGenerationRef.current;
    return (state: ContentPinToTabSessionState) => {
      if (generation !== writeGenerationRef.current) return;
      refreshGenerationRef.current += 1;
      setPinToTabAvailable(state.pinToTabAvailable);
      commitConfirmedPinToTabState(state.pinToTab, state.pinToTabAutomatic);
    };
  }, [commitConfirmedPinToTabState]);
  return {
    pinToTab,
    pinToTabAvailable,
    pinToTabConfirmed,
    setPinToTab,
    createPinSessionCommit,
    ...(automaticPinConfirmed ? { pinToTabAutomaticallyConfirmed: true } : {}),
  };
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
  const pendingVisibilityWriteGenerationRef = useRef<number | null>(null);
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
  const createToolbarVisibilityRefreshGuard = useCallback(() => {
    const startedAtGeneration = visibilityWriteGenerationRef.current;
    const overlapsPendingWrite = pendingVisibilityWriteGenerationRef.current !== null;
    return () =>
      !overlapsPendingWrite && visibilityWriteGenerationRef.current === startedAtGeneration;
  }, []);
  const {
    pinToTab,
    pinToTabAvailable,
    pinToTabConfirmed,
    setPinToTab,
    createPinSessionCommit,
    pinToTabAutomaticallyConfirmed,
  } = useContentPinToTabState(setIsToolbarVisible, createToolbarVisibilityRefreshGuard);
  const setPinnedToolbarVisible = useCallback(
    (value: boolean, contentIntentSource?: ContentPrivilegedActionIntentSource) => {
      const writeGeneration = visibilityWriteGenerationRef.current + 1;
      visibilityWriteGenerationRef.current = writeGeneration;
      pendingVisibilityWriteGenerationRef.current = writeGeneration;
      projectToolbarVisibility(value);
      void writeContentPinToTabToolbarVisibilityState(
        value,
        contentIntentSource,
        createPinSessionCommit()
      )
        .then(() => {
          confirmedToolbarVisibilityRef.current = value;
          if (pendingVisibilityWriteGenerationRef.current === writeGeneration) {
            pendingVisibilityWriteGenerationRef.current = null;
          }
        })
        .catch(() => {
          if (visibilityWriteGenerationRef.current === writeGeneration) {
            pendingVisibilityWriteGenerationRef.current = null;
            projectToolbarVisibility(confirmedToolbarVisibilityRef.current);
          }
        });
    },
    [projectToolbarVisibility, createPinSessionCommit]
  );
  const { quickActionOverlayRef, setQuickActionOverlay } = useQuickActionOverlayState();

  return {
    currentViewport,
    isCompletelyHidden,
    isToolbarVisible,
    navigationLockEnabled,
    pinToTab,
    pinToTabAvailable,
    pinToTabConfirmed,
    ...(pinToTabAutomaticallyConfirmed ? { pinToTabAutomaticallyConfirmed: true } : {}),
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
