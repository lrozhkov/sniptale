// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { initialPermissions, type PermissionState } from './types';
import {
  applyPermissionState,
  subscribeToPermissionChanges,
  syncMicrophonePermissionStatus,
  syncWebPermissionStatus,
} from './subscriptions';

const { subscribeToAddedMock, subscribeToRemovedMock } = vi.hoisted(() => ({
  subscribeToAddedMock: vi.fn(),
  subscribeToRemovedMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/permissions', (_importOriginal) => ({
  browserPermissions: {
    subscribeToAdded: subscribeToAddedMock,
    subscribeToRemoved: subscribeToRemovedMock,
  },
}));

type MockPermissionStatus = PermissionStatus & {
  state: PermissionState;
  onchange: PermissionStatus['onchange'];
};

it('applies permission state updates only to matching entries', () => {
  const updated = applyPermissionState(
    initialPermissions,
    (permission) => permission.id === 'camera',
    'granted'
  );

  expect(updated.find((permission) => permission.id === 'camera')?.state).toBe('granted');
  expect(updated.find((permission) => permission.id === 'microphone')?.state).toBe('unknown');
  expect(updated).not.toBe(initialPermissions);
});

it('syncs microphone permission status updates back into the permissions state', () => {
  const status: MockPermissionStatus = {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    name: 'microphone',
    onchange: null,
    removeEventListener: vi.fn(),
    state: 'prompt',
  };
  let currentPermissions = initialPermissions;
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });

  syncMicrophonePermissionStatus(status, setPermissions);
  status.state = 'granted';
  status.onchange?.(new Event('change'));

  expect(setPermissions).toHaveBeenCalledTimes(1);
  expect(currentPermissions.find((permission) => permission.id === 'microphone')?.state).toBe(
    'granted'
  );
});

it('syncs camera permission status through the generic web permission helper', () => {
  const status: MockPermissionStatus = {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    name: 'camera',
    onchange: null,
    removeEventListener: vi.fn(),
    state: 'prompt',
  };
  let currentPermissions = initialPermissions;
  const setPermissions = vi.fn((updater) => {
    currentPermissions = typeof updater === 'function' ? updater(currentPermissions) : updater;
  });

  syncWebPermissionStatus('camera', status, setPermissions);
  status.state = 'granted';
  status.onchange?.(new Event('change'));

  expect(currentPermissions.find((permission) => permission.id === 'camera')?.state).toBe(
    'granted'
  );
});

it('subscribes to both permission change channels and cleans them up', () => {
  const listener = vi.fn();
  const unsubscribeAdded = vi.fn();
  const unsubscribeRemoved = vi.fn();
  subscribeToAddedMock.mockReturnValue(unsubscribeAdded);
  subscribeToRemovedMock.mockReturnValue(unsubscribeRemoved);

  const unsubscribe = subscribeToPermissionChanges(listener);

  expect(subscribeToAddedMock).toHaveBeenCalledTimes(1);
  expect(subscribeToRemovedMock).toHaveBeenCalledTimes(1);

  const addedListener = subscribeToAddedMock.mock.calls[0]?.[0] as (() => void) | undefined;
  const removedListener = subscribeToRemovedMock.mock.calls[0]?.[0] as (() => void) | undefined;
  addedListener?.();
  removedListener?.();

  expect(listener).toHaveBeenCalledTimes(2);

  unsubscribe();

  expect(unsubscribeAdded).toHaveBeenCalledTimes(1);
  expect(unsubscribeRemoved).toHaveBeenCalledTimes(1);
});
