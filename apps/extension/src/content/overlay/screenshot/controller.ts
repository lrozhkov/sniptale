import { useEffect, useRef, useState } from 'react';

import { createHandleCancelCountdown } from './session/cancel';
import { createHandleTakeScreenshot } from './session/capture';
import { createScreenshotControllerSession } from './session/state';
import type { ScreenshotControllerSession } from './session/state';
import type { ScreenshotControllerRuntime, ScreenshotStartContext, ScreenshotType } from './types';
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
  params: UseScreenshotControllerParams;
  session: ScreenshotControllerSession;
}): ScreenshotControllerRuntime {
  return {
    ...(args.params.captureAdapter === undefined
      ? {}
      : { captureAdapter: args.params.captureAdapter }),
    capturePersistence: args.params.capturePersistence,
    captureActionRef: args.params.captureActionRef,
    session: args.session,
    setCaptureAction: args.params.setCaptureAction,
    setIsCompletelyHidden: args.params.setIsCompletelyHidden,
    setIsToolbarVisible: args.params.setIsToolbarVisible,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    ...(args.params.scenario === undefined ? {} : { scenario: args.params.scenario }),
  };
}

function invalidateScreenshotRuns(args: {
  session: ScreenshotControllerSession;
  setCountdown: (value: number | null) => void;
  setIsCompletelyHidden: (hidden: boolean) => void;
}): ScreenshotStartContext | undefined {
  const startContext = args.session.runActive
    ? { navigationLockBaseline: args.session.navigationLockBaseline }
    : undefined;
  resetInvalidatedCountdownState(args.session, args.setCountdown);
  args.session.runGeneration += 1;
  args.session.runActive = false;
  setUIHidden(false);
  args.setIsCompletelyHidden(false);
  disableSelectionModeIfLoaded();
  return startContext;
}

function resetInvalidatedCountdownState(
  session: ScreenshotControllerSession,
  setCountdown: (value: number | null) => void
): void {
  if (session.countdownTimeout) {
    clearTimeout(session.countdownTimeout);
  }
  session.countdownLock = null;
  session.countdownRunToken = null;
  session.countdownTimeout = null;
  session.pendingType = null;
  setCountdown(null);
}

export function useScreenshotController(
  params: UseScreenshotControllerParams
): UseScreenshotControllerResult {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [session] = useState(() => createScreenshotControllerSession(params.navigationLockEnabled));
  const handleCancelCountdownRef = useRef<(() => void) | null>(null);
  const runtime = createScreenshotRuntime({
    params,
    session,
  });

  const actionArgs = {
    params,
    runtime,
    session,
    setCountdown,
  };
  const handleCancelCountdown = createHandleCancelCountdown(actionArgs);
  const handleTakeScreenshot = createHandleTakeScreenshot(actionArgs);
  handleCancelCountdownRef.current = handleCancelCountdown;

  useCancelCountdownOnUnmount(session, handleCancelCountdownRef);

  return {
    countdown,
    handleCancelCountdown,
    handleTakeScreenshot,
    invalidateScreenshotRuns: () =>
      invalidateScreenshotRuns({
        session,
        setCountdown,
        setIsCompletelyHidden: params.setIsCompletelyHidden,
      }),
  };
}

function useCancelCountdownOnUnmount(
  session: ScreenshotControllerSession,
  handleCancelCountdownRef: { current: (() => void) | null }
): void {
  useEffect(() => {
    const handleCancelCountdown = handleCancelCountdownRef.current;
    return () => {
      if (hasActiveCountdownSession(session)) {
        handleCancelCountdown?.();
      }
    };
  }, [handleCancelCountdownRef, session]);
}

function hasActiveCountdownSession(session: ScreenshotControllerSession) {
  return Boolean(session.countdownTimeout || session.countdownLock);
}
