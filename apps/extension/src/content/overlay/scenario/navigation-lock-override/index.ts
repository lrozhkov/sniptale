import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import { restoreNavigationLockState } from '../../screenshot/bridge';

export function useScenarioNavigationLockOverride(params: {
  navigationLockEnabled: boolean;
  pendingProjectSelection: boolean;
  scenarioCaptureMode: ScenarioCaptureMode;
  scenarioEnabled: boolean;
  setNavigationLockEnabled: (enabled: boolean) => void;
  screenshotMode: boolean;
}) {
  const {
    navigationLockEnabled,
    pendingProjectSelection,
    scenarioCaptureMode,
    scenarioEnabled,
    screenshotMode,
    setNavigationLockEnabled,
  } = params;
  const navigationLockEnabledRef = useRef(navigationLockEnabled);
  const previousLockEnabledRef = useRef<boolean | null>(null);

  navigationLockEnabledRef.current = navigationLockEnabled;
  const shouldDisableLock = shouldDisableNavigationLock({
    pendingProjectSelection,
    scenarioCaptureMode,
    scenarioEnabled,
    screenshotMode,
  });

  useScenarioNavigationLockRestore({
    navigationLockEnabledRef,
    previousLockEnabledRef,
    setNavigationLockEnabled,
    shouldDisableLock,
  });
}

function shouldDisableNavigationLock(params: {
  pendingProjectSelection: boolean;
  scenarioCaptureMode: ScenarioCaptureMode;
  scenarioEnabled: boolean;
  screenshotMode: boolean;
}): boolean {
  return (
    params.screenshotMode &&
    params.scenarioEnabled &&
    params.scenarioCaptureMode === 'by-click' &&
    !params.pendingProjectSelection
  );
}

function useScenarioNavigationLockRestore(params: {
  navigationLockEnabledRef: MutableRefObject<boolean>;
  previousLockEnabledRef: MutableRefObject<boolean | null>;
  setNavigationLockEnabled: (enabled: boolean) => void;
  shouldDisableLock: boolean;
}) {
  const {
    navigationLockEnabledRef,
    previousLockEnabledRef,
    setNavigationLockEnabled,
    shouldDisableLock,
  } = params;
  useEffect(
    () =>
      applyNavigationLockOverride({
        navigationLockEnabledRef,
        previousLockEnabledRef,
        setNavigationLockEnabled,
        shouldDisableLock,
      }),
    [navigationLockEnabledRef, previousLockEnabledRef, setNavigationLockEnabled, shouldDisableLock]
  );
}

function applyNavigationLockOverride(params: {
  navigationLockEnabledRef: MutableRefObject<boolean>;
  previousLockEnabledRef: MutableRefObject<boolean | null>;
  setNavigationLockEnabled: (enabled: boolean) => void;
  shouldDisableLock: boolean;
}) {
  if (!params.shouldDisableLock) {
    return;
  }

  params.previousLockEnabledRef.current = params.navigationLockEnabledRef.current;

  if (params.previousLockEnabledRef.current) {
    // why: scenario by-click mode must allow a real page click to reach the host document.
    restoreNavigationLockState(false, params.setNavigationLockEnabled);
  }

  return () => {
    const previousLockEnabled = params.previousLockEnabledRef.current;
    params.previousLockEnabledRef.current = null;

    if (previousLockEnabled) {
      restoreNavigationLockState(true, params.setNavigationLockEnabled);
    }
  };
}
