import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';

export type CountdownLockSession = {
  navigationLockEnabledBeforeCountdown: boolean;
};

export function beginCountdownLockSession(args: {
  countdownLockSessionRef: { current: CountdownLockSession | null };
  navigationLockStateBeforeScreenshot: { current: boolean };
  setNavigationLockEnabled: (enabled: boolean) => void;
}): void {
  args.countdownLockSessionRef.current = {
    navigationLockEnabledBeforeCountdown: args.navigationLockStateBeforeScreenshot.current,
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
  countdownLockSessionRef: { current: CountdownLockSession | null };
  navigationLockStateBeforeScreenshot: { current: boolean };
  setNavigationLockEnabled: (enabled: boolean) => void;
}): void {
  const enabled =
    args.countdownLockSessionRef.current?.navigationLockEnabledBeforeCountdown ??
    args.navigationLockStateBeforeScreenshot.current;

  clearCountdownLockSession(args.countdownLockSessionRef);
  restoreNavigationLockState(enabled, args.setNavigationLockEnabled);
}

export function clearCountdownLockSession(countdownLockSessionRef: {
  current: CountdownLockSession | null;
}): void {
  countdownLockSessionRef.current = null;
}
