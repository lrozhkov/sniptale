// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { getPermissionContent } from './content';
import { initialPermissions, type PermissionInfo } from './types';

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

function createPermissionInfo(overrides: Partial<PermissionInfo>): PermissionInfo {
  return {
    id: 'custom',
    icon: initialPermissions[0]!.icon,
    state: 'unknown',
    type: 'chrome',
    ...overrides,
  };
}

const permissionContentCases: {
  expected: {
    badgeText?: string;
    description: string;
    name: string;
  };
  permission: Partial<PermissionInfo>;
}[] = [
  {
    expected: {
      badgeText: 'settings.permissions.statusGranted',
      description: 'settings.permissions.sitesDescription',
      name: 'settings.permissions.sitesName',
    },
    permission: { id: 'origins', state: 'granted' },
  },
  {
    expected: {
      badgeText: 'settings.permissions.statusDenied',
      description: 'settings.permissions.microphoneDescription',
      name: 'settings.permissions.microphoneName',
    },
    permission: { id: 'microphone', state: 'denied', type: 'web' },
  },
  {
    expected: {
      badgeText: 'settings.permissions.statusUnknown',
      description: 'settings.permissions.cameraDescription',
      name: 'settings.permissions.cameraName',
    },
    permission: { id: 'camera', state: 'prompt', type: 'web' },
  },
  {
    expected: {
      badgeText: 'settings.permissions.statusError',
      description: 'settings.permissions.downloadsDescription',
      name: 'settings.permissions.downloadsName',
    },
    permission: { id: 'downloads', state: 'error', type: 'chrome' },
  },
  {
    expected: {
      badgeText: 'settings.permissions.statusUnknown',
      description: 'settings.permissions.clipboardDescription',
      name: 'settings.permissions.clipboardName',
    },
    permission: { chromePermission: 'clipboardWrite', id: 'clipboard', state: 'prompt' },
  },
  {
    expected: { description: '', name: 'custom-id' },
    permission: { id: 'custom-id' },
  },
];

it('builds translated permission content for granted, denied, error, unknown, and fallback ids', () => {
  for (const testCase of permissionContentCases) {
    expect(getPermissionContent(createPermissionInfo(testCase.permission))).toEqual(
      expect.objectContaining(testCase.expected)
    );
  }
});
