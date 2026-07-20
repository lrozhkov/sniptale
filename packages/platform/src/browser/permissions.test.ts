import { afterEach, expect, it, vi } from 'vitest';

import { browserPermissions, getMissingOriginPermissions } from './permissions';

const permissions = { permissions: ['downloads'] } satisfies chrome.permissions.Permissions;

function installChromePermissionsStub() {
  const onAdded = { addListener: vi.fn(), removeListener: vi.fn() };
  const onRemoved = { addListener: vi.fn(), removeListener: vi.fn() };
  const chromeStub = {
    permissions: {
      contains: vi.fn((_permissions, callback) => callback(true)),
      getAll: vi.fn((callback) => callback({ origins: ['https://example.test/*'] })),
      onAdded,
      onRemoved,
      remove: vi.fn((_permissions, callback) => callback(true)),
      request: vi.fn((_permissions, callback) => callback(false)),
    },
    runtime: { lastError: undefined as { message: string } | undefined },
  };

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });

  return { chromeStub, onAdded, onRemoved };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('checks, requests, and subscribes to permission events', async () => {
  const { chromeStub, onAdded, onRemoved } = installChromePermissionsStub();
  const addedListener: Parameters<typeof browserPermissions.subscribeToAdded>[0] = vi.fn();
  const removedListener: Parameters<typeof browserPermissions.subscribeToRemoved>[0] = vi.fn();

  expect(browserPermissions.isAvailable()).toBe(true);
  await expect(browserPermissions.contains(permissions)).resolves.toBe(true);
  await expect(browserPermissions.getAll()).resolves.toEqual({
    origins: ['https://example.test/*'],
  });
  await expect(browserPermissions.request(permissions)).resolves.toBe(false);
  await expect(browserPermissions.remove(permissions)).resolves.toBe(true);

  const unsubscribeAdded = browserPermissions.subscribeToAdded(addedListener);
  const unsubscribeRemoved = browserPermissions.subscribeToRemoved(removedListener);

  expect(chromeStub.permissions.contains).toHaveBeenCalledWith(permissions, expect.any(Function));
  expect(chromeStub.permissions.getAll).toHaveBeenCalledWith(expect.any(Function));
  expect(chromeStub.permissions.request).toHaveBeenCalledWith(permissions, expect.any(Function));
  expect(chromeStub.permissions.remove).toHaveBeenCalledWith(permissions, expect.any(Function));
  expect(onAdded.addListener).toHaveBeenCalledWith(addedListener);
  expect(onRemoved.addListener).toHaveBeenCalledWith(removedListener);

  unsubscribeAdded();
  unsubscribeRemoved();
  expect(onAdded.removeListener).toHaveBeenCalledWith(addedListener);
  expect(onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
});

it('rejects permission operations when chrome.permissions is unavailable', async () => {
  expect(browserPermissions.isAvailable()).toBe(false);
  await expect(browserPermissions.contains(permissions)).rejects.toThrow(
    'chrome.permissions is unavailable'
  );
  await expect(browserPermissions.request(permissions)).rejects.toThrow(
    'chrome.permissions is unavailable'
  );
  await expect(browserPermissions.getAll()).rejects.toThrow('chrome.permissions is unavailable');
  await expect(browserPermissions.remove(permissions)).rejects.toThrow(
    'chrome.permissions is unavailable'
  );
});

it('returns only origins that are not already granted', async () => {
  const { chromeStub } = installChromePermissionsStub();
  chromeStub.permissions.contains.mockImplementation((permission, callback) =>
    callback(permission.origins?.[0] === 'https://granted.test/*')
  );

  await expect(
    getMissingOriginPermissions(['https://granted.test/*', 'https://missing.test/*'])
  ).resolves.toEqual(['https://missing.test/*']);
});
