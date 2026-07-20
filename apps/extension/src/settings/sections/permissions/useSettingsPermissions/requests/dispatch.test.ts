import { expect, it, vi } from 'vitest';

import { requestTypedPermission } from './dispatch';

type RequestCase = {
  expected: boolean;
  permission: Parameters<typeof requestTypedPermission>[0];
};

const requestCases: RequestCase[] = [
  { expected: true, permission: { id: 'microphone', type: 'web' } as never },
  { expected: true, permission: { id: 'camera', type: 'web' } as never },
  {
    expected: true,
    permission: { chromePermission: 'downloads', id: 'downloads', type: 'chrome' } as never,
  },
  {
    expected: true,
    permission: { id: 'origins', originPattern: '<all_urls>', type: 'origin' } as never,
  },
  { expected: false, permission: { id: 'other', type: 'chrome' } as never },
];

it('dispatches typed permissions to the matching request handler', async () => {
  const requestMicrophone = vi.fn(async () => true);
  const requestCamera = vi.fn(async () => true);
  const requestChrome = vi.fn(async () => true);
  const requestOrigin = vi.fn(async () => true);

  for (const testCase of requestCases) {
    await expect(
      requestTypedPermission(
        testCase.permission,
        requestMicrophone,
        requestCamera,
        requestChrome,
        requestOrigin
      )
    ).resolves.toBe(testCase.expected);
  }

  expect(requestMicrophone).toHaveBeenCalledTimes(1);
  expect(requestCamera).toHaveBeenCalledTimes(1);
  expect(requestChrome).toHaveBeenCalledTimes(1);
  expect(requestOrigin).toHaveBeenCalledTimes(1);
});
