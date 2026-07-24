import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';
import type { ScreenshotControllerSession } from '../session/state';

export function beginCountdownLockSession(args: {
  session: Pick<ScreenshotControllerSession, 'countdownLock' | 'navigationLockBaseline'>;
  setNavigationLockEnabled: (enabled: boolean) => void;
}): void {
  args.session.countdownLock = {
    navigationLockEnabledBeforeCountdown: args.session.navigationLockBaseline,
  };
  disableNavigationLock();
  args.setNavigationLockEnabled(false);
}

export function restoreNavigationLockState(
  enabled: boolean,
  setNavigationLockEnabled: (enabled: boolean) => void
): void {
  if (enabled) {
    enableNavigationLock(false);
  } else {
    disableNavigationLock();
  }

  setNavigationLockEnabled(enabled);
}

export function restoreCountdownLockOnCancel(args: {
  session: Pick<ScreenshotControllerSession, 'countdownLock' | 'navigationLockBaseline'>;
  setNavigationLockEnabled: (enabled: boolean) => void;
}): void {
  const enabled =
    args.session.countdownLock?.navigationLockEnabledBeforeCountdown ??
    args.session.navigationLockBaseline;

  clearCountdownLockSession(args.session);
  restoreNavigationLockState(enabled, args.setNavigationLockEnabled);
}

export function clearCountdownLockSession(
  session: Pick<ScreenshotControllerSession, 'countdownLock'>
): void {
  session.countdownLock = null;
}
