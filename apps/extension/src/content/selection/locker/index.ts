import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createNavigationLocker } from './runtime';

const navigationLockerOwner = createLazyContentDefaultOwner(createNavigationLocker);

export function enableNavigationLock(fullLockMode?: boolean): void {
  navigationLockerOwner.getOwner().enableNavigationLock(fullLockMode);
}

export function disableNavigationLock(): void {
  navigationLockerOwner.getOwnerIfCreated()?.disableNavigationLock();
}

export function enableTextSelectionBlock(): void {
  navigationLockerOwner.getOwner().enableTextSelectionBlock();
}

export function disableTextSelectionBlock(): void {
  navigationLockerOwner.getOwnerIfCreated()?.disableTextSelectionBlock();
}

export function isLockEnabled(): boolean {
  return navigationLockerOwner.getOwnerIfCreated()?.isLockEnabled() ?? false;
}

export function setFullLockMode(fullLockMode: boolean): void {
  navigationLockerOwner.getOwner().setFullLockMode(fullLockMode);
}

export function setUIHidden(hidden: boolean): void {
  navigationLockerOwner.getOwner().setUIHidden(hidden);
}
