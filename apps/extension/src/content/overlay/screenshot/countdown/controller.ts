import {
  beginCountdownLockSession,
  clearCountdownLockSession,
  restoreCountdownLockOnCancel,
  restoreNavigationLockState,
} from './session';
import { resetScreenshotCountdownRuntimeState, startScreenshotCountdownTimer } from './timer';
import type { ScreenshotControllerSession } from '../session/state';
import type { ScreenshotType } from '../types';

export function startCountdown(args: {
  onElapsed: () => void;
  session: ScreenshotControllerSession;
  setCountdown: (value: number | null) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
  timerDelay: number;
  type: ScreenshotType;
}): void {
  beginCountdownLockSession({
    session: args.session,
    setNavigationLockEnabled: args.setNavigationLockEnabled,
  });
  args.setIsToolbarVisible(false);
  startScreenshotCountdownTimer({
    onElapsed: () => {
      clearCountdownLockSession(args.session);
      args.onElapsed();
    },
    session: args.session,
    setCountdown: args.setCountdown,
    timerDelay: args.timerDelay,
    type: args.type,
  });
}

export const resetCountdownRuntimeState = resetScreenshotCountdownRuntimeState;
export { beginCountdownLockSession, restoreCountdownLockOnCancel, restoreNavigationLockState };
