import { useEffect, useRef, useState } from 'react';

import { createScreenshotControllerActions } from './session/actions';
import { type CountdownLockSession, type ScreenshotType } from './countdown/controller';
import type { ScreenshotControllerRuntime, ScreenshotStartContext } from './types';
import { type ScreenshotControllerParams as UseScreenshotControllerParams } from './mode';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import { disableSelectionModeIfLoaded } from '../../selection/selection-mode/lazy';
import { setUIHidden } from '../../selection/locker';

interface UseScreenshotControllerResult {
  countdown: number | null;
  handleCancelCountdown: () => void;
  handleTakeScreenshot: (
    type: ScreenshotType,
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>;
  invalidateScreenshotRuns: () => ScreenshotStartContext | undefined;
}

function createScreenshotRuntime(args: {
  navigationLockStateBeforeScreenshot: { current: boolean };
  params: UseScreenshotControllerParams;
  screenshotRunActiveRef: { current: boolean };
  screenshotRunGenerationRef: { current: number };
}): ScreenshotControllerRuntime {
  return {
    ...(args.params.captureAdapter === undefined
      ? {}
      : { captureAdapter: args.params.captureAdapter }),
    capturePersistence: args.params.capturePersistence,
    captureActionRef: args.params.captureActionRef,
    navigationLockStateBeforeScreenshot: args.navigationLockStateBeforeScreenshot,
    screenshotRunActiveRef: args.screenshotRunActiveRef,
    screenshotRunGenerationRef: args.screenshotRunGenerationRef,
    setIsCompletelyHidden: args.params.setIsCompletelyHidden,
    setIsToolbarVisible: args.params.setIsToolbarVisible,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    ...(args.params.scenario === undefined ? {} : { scenario: args.params.scenario }),
  };
}

function invalidateScreenshotRuns(args: {
  countdownLockSessionRef: { current: CountdownLockSession | null };
  countdownRunTokenRef: { current: number | null };
  countdownTimeoutRef: { current: ReturnType<typeof setTimeout> | null };
  navigationLockStateBeforeScreenshot: { current: boolean };
  pendingScreenshotType: { current: ScreenshotType | null };
  screenshotRunActiveRef: { current: boolean };
  screenshotRunGenerationRef: { current: number };
  setCountdown: (value: number | null) => void;
  setIsCompletelyHidden: (hidden: boolean) => void;
}): ScreenshotStartContext | undefined {
  const startContext = args.screenshotRunActiveRef.current
    ? { navigationLockBaseline: args.navigationLockStateBeforeScreenshot.current }
    : undefined;
  resetInvalidatedCountdownState(args);
  args.screenshotRunGenerationRef.current += 1;
  args.screenshotRunActiveRef.current = false;
  setUIHidden(false);
  args.setIsCompletelyHidden(false);
  disableSelectionModeIfLoaded();
  return startContext;
}

function resetInvalidatedCountdownState(args: {
  countdownLockSessionRef: { current: CountdownLockSession | null };
  countdownRunTokenRef: { current: number | null };
  countdownTimeoutRef: { current: ReturnType<typeof setTimeout> | null };
  pendingScreenshotType: { current: ScreenshotType | null };
  setCountdown: (value: number | null) => void;
}): void {
  if (args.countdownTimeoutRef.current) {
    clearTimeout(args.countdownTimeoutRef.current);
  }
  args.countdownLockSessionRef.current = null;
  args.countdownRunTokenRef.current = null;
  args.countdownTimeoutRef.current = null;
  args.pendingScreenshotType.current = null;
  args.setCountdown(null);
}

export function useScreenshotController(
  params: UseScreenshotControllerParams
): UseScreenshotControllerResult {
  const [countdown, setCountdown] = useState<number | null>(null);
  const handleCancelCountdownRef = useRef<(() => void) | null>(null);
  const { refs, screenshotRunActiveRef, screenshotRunGenerationRef } = useScreenshotControllerRefs(
    params.navigationLockEnabled
  );
  const runtime = createScreenshotRuntime({
    navigationLockStateBeforeScreenshot: refs.navigationLockStateBeforeScreenshot,
    params,
    screenshotRunActiveRef,
    screenshotRunGenerationRef,
  });

  const { handleCancelCountdown, handleTakeScreenshot } = createScreenshotControllerActions({
    params,
    refs,
    runtime,
    setCountdown,
  });
  handleCancelCountdownRef.current = handleCancelCountdown;

  useCancelCountdownOnUnmount(
    refs.countdownTimeoutRef,
    refs.countdownLockSessionRef,
    handleCancelCountdownRef
  );

  return {
    countdown,
    handleCancelCountdown,
    handleTakeScreenshot,
    invalidateScreenshotRuns: () =>
      invalidateScreenshotRuns({
        ...refs,
        screenshotRunActiveRef,
        screenshotRunGenerationRef,
        setCountdown,
        setIsCompletelyHidden: params.setIsCompletelyHidden,
      }),
  };
}

function useScreenshotControllerRefs(navigationLockEnabled: boolean) {
  const countdownLockSessionRef = useRef<CountdownLockSession | null>(null);
  const countdownRunTokenRef = useRef<number | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationLockStateBeforeScreenshot = useRef(navigationLockEnabled);
  const pendingScreenshotType = useRef<ScreenshotType | null>(null);
  const screenshotRunActiveRef = useRef(false);
  const screenshotRunGenerationRef = useRef(0);

  return {
    refs: {
      countdownLockSessionRef,
      countdownRunTokenRef,
      countdownTimeoutRef,
      navigationLockStateBeforeScreenshot,
      pendingScreenshotType,
    },
    screenshotRunActiveRef,
    screenshotRunGenerationRef,
  };
}

function useCancelCountdownOnUnmount(
  countdownTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
  countdownLockSessionRef: { current: CountdownLockSession | null },
  handleCancelCountdownRef: { current: (() => void) | null }
): void {
  useEffect(() => {
    const handleCancelCountdown = handleCancelCountdownRef.current;
    return () => {
      if (hasActiveCountdownSession(countdownTimeoutRef, countdownLockSessionRef)) {
        handleCancelCountdown?.();
      }
    };
  }, [countdownLockSessionRef, countdownTimeoutRef, handleCancelCountdownRef]);
}

function hasActiveCountdownSession(
  countdownTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
  countdownLockSessionRef: { current: CountdownLockSession | null }
) {
  return Boolean(countdownTimeoutRef.current || countdownLockSessionRef.current);
}
