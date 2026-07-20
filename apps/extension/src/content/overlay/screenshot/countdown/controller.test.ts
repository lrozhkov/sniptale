import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginCountdownLockSession,
  resetCountdownRuntimeState,
  restoreCountdownLockOnCancel,
  startCountdown,
  type CountdownLockSession,
} from './controller';
import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';

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
  const countdownLockSessionRef = {
    current: null,
  } as { current: CountdownLockSession | null };
  const countdownTimeoutRef = {
    current: null,
  } as { current: ReturnType<typeof setTimeout> | null };
  const navigationLockStateBeforeScreenshot = {
    current: true,
  };
  const pendingScreenshotType = {
    current: null,
  } as { current: 'visible' | 'full' | 'selection' | null };
  const setCountdown = vi.fn();
  const setIsToolbarVisible = vi.fn();
  const setNavigationLockEnabled = vi.fn();

  startCountdown({
    countdownLockSessionRef,
    countdownTimeoutRef,
    navigationLockStateBeforeScreenshot,
    onElapsed: vi.fn(),
    pendingScreenshotType,
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
  expect(countdownLockSessionRef.current).toEqual({
    navigationLockEnabledBeforeCountdown: true,
  });
  expect(pendingScreenshotType.current).toBe('visible');
}

function expectCancelledCountdownRestoresNavigationLock() {
  const countdownLockSessionRef = {
    current: null,
  } as { current: CountdownLockSession | null };
  const navigationLockStateBeforeScreenshot = {
    current: true,
  };
  const setNavigationLockEnabled = vi.fn();

  beginCountdownLockSession({
    countdownLockSessionRef,
    navigationLockStateBeforeScreenshot,
    setNavigationLockEnabled,
  });

  restoreCountdownLockOnCancel({
    countdownLockSessionRef,
    navigationLockStateBeforeScreenshot,
    setNavigationLockEnabled,
  });

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(setNavigationLockEnabled).toHaveBeenLastCalledWith(true);
  expect(countdownLockSessionRef.current).toBeNull();
}

function expectVisibleCountdownCompletionLeavesNavigationUnlocked() {
  vi.useFakeTimers();

  const countdownLockSessionRef = {
    current: null,
  } as { current: CountdownLockSession | null };
  const countdownTimeoutRef = {
    current: null,
  } as { current: ReturnType<typeof setTimeout> | null };
  const navigationLockStateBeforeScreenshot = {
    current: true,
  };
  const pendingScreenshotType = {
    current: null,
  } as { current: 'visible' | 'full' | 'selection' | null };
  const onElapsed = vi.fn();

  startCountdown({
    countdownLockSessionRef,
    countdownTimeoutRef,
    navigationLockStateBeforeScreenshot,
    onElapsed,
    pendingScreenshotType,
    setCountdown: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    timerDelay: 1,
    type: 'visible',
  });

  vi.advanceTimersByTime(1000);

  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(onElapsed).toHaveBeenCalledTimes(1);
  expect(countdownLockSessionRef.current).toBeNull();
}

function expectResetClearsTimerAndPendingType() {
  const timeoutId = setTimeout(() => undefined, 1_000);
  const countdownTimeoutRef = {
    current: timeoutId,
  } as { current: ReturnType<typeof setTimeout> | null };
  const pendingScreenshotType = {
    current: 'visible',
  } as { current: 'visible' | 'full' | 'selection' | null };
  const setCountdown = vi.fn();

  resetCountdownRuntimeState({
    countdownTimeoutRef,
    pendingScreenshotType,
    setCountdown,
  });
  clearTimeout(timeoutId);

  expect(setCountdown).toHaveBeenCalledWith(null);
  expect(countdownTimeoutRef.current).toBeNull();
  expect(pendingScreenshotType.current).toBeNull();
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
