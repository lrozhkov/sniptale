import { beforeEach, expect, it, vi } from 'vitest';

const { containsMock, requestMock } = vi.hoisted(() => ({
  containsMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  browserPermissions: {
    contains: containsMock,
    request: requestMock,
  },
}));

import {
  containsChromePermission,
  containsOriginPermission,
  containsOriginPermissions,
  requestChromePermission,
  requestOriginPermission,
  requestOriginPermissions,
} from './browser-permissions';

beforeEach(() => {
  containsMock.mockReset();
  requestMock.mockReset();
});

it('routes chrome and origin permission requests through browser adapters', async () => {
  requestMock.mockResolvedValue(true);

  await expect(requestChromePermission('downloads')).resolves.toBe(true);
  await expect(requestOriginPermission('<all_urls>')).resolves.toBe(true);
  await expect(requestOriginPermissions(['http://*/*', 'https://*/*'])).resolves.toBe(true);

  expect(requestMock).toHaveBeenNthCalledWith(1, { permissions: ['downloads'] });
  expect(requestMock).toHaveBeenNthCalledWith(2, { origins: ['<all_urls>'] });
  expect(requestMock).toHaveBeenNthCalledWith(3, { origins: ['http://*/*', 'https://*/*'] });
});

it('contains helpers forward to permissions adapter queries', async () => {
  containsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

  await expect(containsChromePermission('clipboardWrite')).resolves.toBe(true);
  await expect(containsOriginPermission('<all_urls>')).resolves.toBe(false);
  await expect(containsOriginPermissions(['http://*/*', 'https://*/*'])).resolves.toBe(true);

  expect(containsMock).toHaveBeenNthCalledWith(1, { permissions: ['clipboardWrite'] });
  expect(containsMock).toHaveBeenNthCalledWith(2, { origins: ['<all_urls>'] });
  expect(containsMock).toHaveBeenNthCalledWith(3, { origins: ['http://*/*', 'https://*/*'] });
});
