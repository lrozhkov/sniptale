// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { getPermissionContent } from './content';
import { applyPermissionState, syncMicrophonePermissionStatus } from './subscriptions';
import { initialPermissions, type PermissionInfo, type PermissionState } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

type MockPermissionStatus = PermissionStatus & {
  state: PermissionState;
  onchange: PermissionStatus['onchange'];
};

function createPermissionInfo(overrides: Partial<PermissionInfo>): PermissionInfo {
  return {
    id: 'custom',
    icon: initialPermissions[0]!.icon,
    state: 'unknown',
    type: 'chrome',
    ...overrides,
  };
}

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

it('builds translated permission content for granted, denied, error, unknown, and fallback ids', () => {
  expect(getPermissionContent(createPermissionInfo({ id: 'origins', state: 'granted' }))).toEqual(
    expect.objectContaining({
      name: 'settings.permissions.sitesName',
      description: 'settings.permissions.sitesDescription',
      badgeText: 'settings.permissions.statusGranted',
    })
  );

  expect(
    getPermissionContent(createPermissionInfo({ id: 'microphone', state: 'denied', type: 'web' }))
  ).toEqual(
    expect.objectContaining({
      name: 'settings.permissions.microphoneName',
      description: 'settings.permissions.microphoneDescription',
      badgeText: 'settings.permissions.statusDenied',
    })
  );

  expect(
    getPermissionContent(createPermissionInfo({ id: 'downloads', state: 'error', type: 'chrome' }))
  ).toEqual(
    expect.objectContaining({
      name: 'settings.permissions.downloadsName',
      description: 'settings.permissions.downloadsDescription',
      badgeText: 'settings.permissions.statusError',
    })
  );

  expect(
    getPermissionContent(
      createPermissionInfo({
        id: 'clipboard',
        state: 'prompt',
        chromePermission: 'clipboardWrite',
      })
    )
  ).toEqual(
    expect.objectContaining({
      name: 'settings.permissions.clipboardName',
      description: 'settings.permissions.clipboardDescription',
      badgeText: 'settings.permissions.statusUnknown',
    })
  );
});

it('falls back to the permission id when translated permission copy is unavailable', () => {
  expect(getPermissionContent(createPermissionInfo({ id: 'custom-id' }))).toEqual(
    expect.objectContaining({
      name: 'custom-id',
      description: '',
    })
  );
});
