import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginCountdownLockSession,
  resetCountdownRuntimeState,
  restoreCountdownLockOnCancel,
  startCountdown,
} from './controller';
import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';
import { createScreenshotControllerSession } from '../session/state';

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function expectCountdownDisablesNavigationLock() {
  const session = createScreenshotControllerSession(true);
  const setCountdown = vi.fn();
  const setIsToolbarVisible = vi.fn();
  const setNavigationLockEnabled = vi.fn();

  startCountdown({
    onElapsed: vi.fn(),
    session,
    setCountdown,
    setIsToolbarVisible,
    setNavigationLockEnabled,
    timerDelay: 3,
    type: 'visible',
  });

  expect(disableNavigationLock).toHaveBeenCalledTimes(1);
  expect(setNavigationLockEnabled).toHaveBeenCalledWith(false);
  expect(setIsToolbarVisible).toHaveBeenCalledWith(false);
  expect(setCountdown).toHaveBeenCalledWith(3);
  expect(session.countdownLock).toEqual({
    navigationLockEnabledBeforeCountdown: true,
  });
  expect(session.pendingType).toBe('visible');
}

function expectCancelledCountdownRestoresNavigationLock() {
  const session = createScreenshotControllerSession(true);
  const setNavigationLockEnabled = vi.fn();

  beginCountdownLockSession({
    session,
    setNavigationLockEnabled,
  });

  restoreCountdownLockOnCancel({
    session,
    setNavigationLockEnabled,
  });

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(setNavigationLockEnabled).toHaveBeenLastCalledWith(true);
  expect(session.countdownLock).toBeNull();
}

function expectVisibleCountdownCompletionLeavesNavigationUnlocked() {
  vi.useFakeTimers();

  const session = createScreenshotControllerSession(true);
  const onElapsed = vi.fn();

  startCountdown({
    onElapsed,
    session,
    setCountdown: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    timerDelay: 1,
    type: 'visible',
  });

  vi.advanceTimersByTime(1000);

  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(onElapsed).toHaveBeenCalledTimes(1);
  expect(session.countdownLock).toBeNull();
}

function expectResetClearsTimerAndPendingType() {
  const timeoutId = setTimeout(() => undefined, 1_000);
  const session = createScreenshotControllerSession(true);
  session.countdownTimeout = timeoutId;
  session.pendingType = 'visible';
  const setCountdown = vi.fn();

  resetCountdownRuntimeState({
    session,
    setCountdown,
  });
  clearTimeout(timeoutId);

  expect(setCountdown).toHaveBeenCalledWith(null);
  expect(session.countdownTimeout).toBeNull();
  expect(session.pendingType).toBeNull();
}

describe('screenshot-controller-countdown', () => {
  it(
    'disables navigation lock while the countdown is running',
    expectCountdownDisablesNavigationLock
  );
  it(
    'restores the prior navigation lock state when the countdown is cancelled',
    expectCancelledCountdownRestoresNavigationLock
  );
  it(
    'does not re-lock navigation before visible capture starts after countdown elapses',
    expectVisibleCountdownCompletionLeavesNavigationUnlocked
  );
  it(
    'clears timer refs and pending screenshot state through the shared reset helper',
    expectResetClearsTimerAndPendingType
  );
});
