import { beforeEach, expect, it, vi } from 'vitest';

const locker = vi.hoisted(() => ({
  disableNavigationLock: vi.fn(),
  disableTextSelectionBlock: vi.fn(),
  enableNavigationLock: vi.fn(),
  enableTextSelectionBlock: vi.fn(),
  isLockEnabled: vi.fn(() => true),
  setFullLockMode: vi.fn(),
  setInputShieldSuspended: vi.fn(),
  setUIHidden: vi.fn(),
}));

vi.mock('./runtime', () => ({
  createNavigationLocker: () => locker,
}));

import {
  disableNavigationLock,
  disableTextSelectionBlock,
  enableNavigationLock,
  enableTextSelectionBlock,
  isLockEnabled,
  setFullLockMode,
  setNavigationInputShieldSuspended,
  setUIHidden,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  locker.isLockEnabled.mockReturnValue(true);
});

it('reports an inactive lock before the lazy owner is created', () => {
  expect(isLockEnabled()).toBe(false);
  expect(locker.isLockEnabled).not.toHaveBeenCalled();
});

it('routes the public lock facade through its single lazy owner', () => {
  enableNavigationLock(true);
  enableTextSelectionBlock();
  setFullLockMode(false);
  setNavigationInputShieldSuspended(true);
  setUIHidden(true);

  expect(isLockEnabled()).toBe(true);
  expect(locker.enableNavigationLock).toHaveBeenCalledWith(true);
  expect(locker.enableTextSelectionBlock).toHaveBeenCalledOnce();
  expect(locker.setFullLockMode).toHaveBeenCalledWith(false);
  expect(locker.setInputShieldSuspended).toHaveBeenCalledWith(true);
  expect(locker.setUIHidden).toHaveBeenCalledWith(true);

  disableTextSelectionBlock();
  disableNavigationLock();
  expect(locker.disableTextSelectionBlock).toHaveBeenCalledOnce();
  expect(locker.disableNavigationLock).toHaveBeenCalledOnce();
});
