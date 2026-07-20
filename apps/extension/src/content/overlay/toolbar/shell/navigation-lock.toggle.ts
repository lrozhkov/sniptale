import type { Dispatch, SetStateAction } from 'react';
import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';

export function createToolbarNavigationLockToggle(params: {
  navigationLockEnabled: boolean;
  onToggleNavigationLock?: (enabled: boolean) => void;
  setNavigationLockEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  return () => {
    const newEnabled = !params.navigationLockEnabled;

    if (newEnabled) {
      enableNavigationLock(false);
    } else {
      disableNavigationLock();
    }

    params.setNavigationLockEnabled(newEnabled);
    params.onToggleNavigationLock?.(newEnabled);
  };
}
