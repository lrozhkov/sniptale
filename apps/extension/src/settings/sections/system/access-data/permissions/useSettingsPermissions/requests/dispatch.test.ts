import { expect, it, vi } from 'vitest';
import { FolderOpen } from 'lucide-react';

import { requestTypedPermission } from './dispatch';
import type { PermissionInfo } from '../../permissions-lib';

type RequestCase = {
  expected: boolean;
  permission: Parameters<typeof requestTypedPermission>[0];
};

const requestCases: RequestCase[] = [
  { expected: true, permission: createPermission({ id: 'microphone', type: 'web' }) },
  { expected: true, permission: createPermission({ id: 'camera', type: 'web' }) },
  {
    expected: true,
    permission: createPermission({
      chromePermission: 'downloads',
      id: 'downloads',
      type: 'chrome',
    }),
  },
  {
    expected: true,
    permission: createPermission({ id: 'origins', originPattern: '<all_urls>', type: 'origin' }),
  },
  {
    expected: true,
    permission: createPermission({ id: 'localFiles', originPattern: 'file:///', type: 'file' }),
  },
  { expected: false, permission: createPermission({ id: 'other', type: 'chrome' }) },
];

function createPermission(
  overrides: Partial<PermissionInfo> & Pick<PermissionInfo, 'id' | 'type'>
): PermissionInfo {
  return { icon: FolderOpen, state: 'prompt', ...overrides };
}

it('dispatches typed permissions to the matching request handler', async () => {
  const requestMicrophone = vi.fn(async () => true);
  const requestCamera = vi.fn(async () => true);
  const requestChrome = vi.fn(async () => true);
  const requestOrigin = vi.fn(async () => true);
  const requestFileScheme = vi.fn(async () => true);

  for (const testCase of requestCases) {
    await expect(
      requestTypedPermission(testCase.permission, {
        requestCamera,
        requestChrome,
        requestFileScheme,
        requestMicrophone,
        requestOrigin,
      })
    ).resolves.toBe(testCase.expected);
  }

  expect(requestMicrophone).toHaveBeenCalledTimes(1);
  expect(requestCamera).toHaveBeenCalledTimes(1);
  expect(requestChrome).toHaveBeenCalledTimes(1);
  expect(requestOrigin).toHaveBeenCalledTimes(1);
  expect(requestFileScheme).toHaveBeenCalledTimes(1);
});
