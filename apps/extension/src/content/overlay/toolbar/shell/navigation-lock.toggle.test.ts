import { describe, expect, it, vi } from 'vitest';

const navigationLockToggleMocks = vi.hoisted(() => ({
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
}));

vi.mock('../../../selection/locker', () => ({
  disableNavigationLock: navigationLockToggleMocks.disableNavigationLock,
  enableNavigationLock: navigationLockToggleMocks.enableNavigationLock,
}));

import { createToolbarNavigationLockToggle } from './navigation-lock.toggle';

describe('createToolbarNavigationLockToggle', () => {
  it('switches into unlocked mode and notifies consumers', () => {
    const setNavigationLockEnabled = vi.fn();
    const onToggleNavigationLock = vi.fn();

    createToolbarNavigationLockToggle({
      navigationLockEnabled: true,
      onToggleNavigationLock,
      setNavigationLockEnabled,
    })();

    expect(navigationLockToggleMocks.disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(setNavigationLockEnabled).toHaveBeenCalledWith(false);
    expect(onToggleNavigationLock).toHaveBeenCalledWith(false);
  });

  it('switches into locked mode through the managed enable path', () => {
    const setNavigationLockEnabled = vi.fn();

    createToolbarNavigationLockToggle({
      navigationLockEnabled: false,
      setNavigationLockEnabled,
    })();

    expect(navigationLockToggleMocks.enableNavigationLock).toHaveBeenCalledWith(false);
    expect(setNavigationLockEnabled).toHaveBeenCalledWith(true);
  });
});
