import type { MutableRefObject } from 'react';

import {
  beginCountdownLockSession,
  clearCountdownLockSession,
  restoreCountdownLockOnCancel,
  restoreNavigationLockState,
  type CountdownLockSession,
} from './session';
import {
  resetScreenshotCountdownRuntimeState,
  startScreenshotCountdownTimer,
  type ScreenshotType,
} from './timer';

export type { CountdownLockSession, ScreenshotType };

export function startCountdown(args: {
  countdownLockSessionRef: MutableRefObject<CountdownLockSession | null>;
  countdownTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  navigationLockStateBeforeScreenshot: MutableRefObject<boolean>;
  onElapsed: () => void;
  pendingScreenshotType: { current: ScreenshotType | null };
  setCountdown: (value: number | null) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
  timerDelay: number;
  type: ScreenshotType;
}): void {
  beginCountdownLockSession({
    countdownLockSessionRef: args.countdownLockSessionRef,
    navigationLockStateBeforeScreenshot: args.navigationLockStateBeforeScreenshot,
    setNavigationLockEnabled: args.setNavigationLockEnabled,
  });
  args.setIsToolbarVisible(false);
  startScreenshotCountdownTimer({
    countdownTimeoutRef: args.countdownTimeoutRef,
    onElapsed: () => {
      clearCountdownLockSession(args.countdownLockSessionRef);
      args.onElapsed();
    },
    pendingScreenshotType: args.pendingScreenshotType,
    setCountdown: args.setCountdown,
    timerDelay: args.timerDelay,
    type: args.type,
  });
}

export const resetCountdownRuntimeState = resetScreenshotCountdownRuntimeState;
export { beginCountdownLockSession, restoreCountdownLockOnCancel, restoreNavigationLockState };
