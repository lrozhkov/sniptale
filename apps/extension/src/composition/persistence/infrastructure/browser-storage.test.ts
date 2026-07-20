import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserStorage } from './browser-storage';
import { installPersistenceLockManagerForTests } from './mutation-barrier';

function createStorageArea() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  };
}

function createChromeStorageStub() {
  const local = createStorageArea();
  const sync = createStorageArea();
  const session = createStorageArea();
  const onChanged = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };

  return {
    chrome: {
      runtime: {
        lastError: undefined as { message: string } | undefined,
      },
      storage: {
        local,
        sync,
        session,
        onChanged,
      },
    },
    local,
    onChanged,
    session,
    sync,
  };
}

function installChromeStorageStub(
  chromeStub: ReturnType<typeof createChromeStorageStub>['chrome']
) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

function resetBrowserStorageGlobals() {
  Reflect.deleteProperty(globalThis, 'chrome');
}

async function verifyAvailabilityAndGetContract() {
  const { chrome, local } = createChromeStorageStub();
  installChromeStorageStub(chrome);

  local.get.mockImplementation((keys: unknown, callback: (value: unknown) => void) => {
    callback({ ok: true, keys });
  });

  expect(browserStorage.local.isAvailable()).toBe(true);
  await expect(browserStorage.local.get()).resolves.toEqual({ ok: true, keys: null });
  await expect(browserStorage.local.get({ foo: 'bar' })).resolves.toEqual({ foo: 'bar' });
  expect(local.get).toHaveBeenCalledWith(['foo'], expect.any(Function));
}

async function verifySetRemoveAndUnavailableErrors() {
  const { chrome, local } = createChromeStorageStub();
  installChromeStorageStub(chrome);

  local.set.mockImplementation((items: unknown, callback: () => void) => {
    callback();
    return items;
  });
  local.get.mockImplementation((_keys: unknown, callback: (value: unknown) => void) => {
    callback({});
  });
  local.remove.mockImplementation((keys: unknown, callback: () => void) => {
    callback();
    return keys;
  });

  await expect(browserStorage.local.set({ bar: 'baz', foo: 'bar' })).resolves.toBeUndefined();
  await expect(browserStorage.local.remove(['foo'])).resolves.toBeUndefined();
  expect(local.set).toHaveBeenCalledWith({ bar: 'baz', foo: 'bar' }, expect.any(Function));
  expect(local.remove).toHaveBeenCalledWith(['foo'], expect.any(Function));

  resetBrowserStorageGlobals();

  await expect(browserStorage.local.get()).rejects.toThrow('chrome.storage.local is unavailable');
  await expect(browserStorage.local.set({ foo: 'bar' })).rejects.toThrow(
    'chrome.storage.local is unavailable'
  );
  await expect(browserStorage.local.remove(['foo'])).rejects.toThrow(
    'chrome.storage.local is unavailable'
  );
}

function verifyChangeObservationAndSubscription() {
  const { chrome, onChanged } = createChromeStorageStub();
  const listener = vi.fn();

  expect(browserStorage.canObserveChanges()).toBe(false);

  installChromeStorageStub(chrome);

  expect(browserStorage.canObserveChanges()).toBe(true);

  const unsubscribe = browserStorage.subscribeToChanges(listener);

  expect(onChanged.addListener).toHaveBeenCalledWith(listener);

  unsubscribe();

  expect(onChanged.removeListener).toHaveBeenCalledWith(listener);
}

describe('storage browser adapter', () => {
  beforeEach(() => {
    resetBrowserStorageGlobals();
    installPersistenceLockManagerForTests({
      request: async (_name, _options, operation) => operation(),
    });
  });
  afterEach(() => {
    resetBrowserStorageGlobals();
    installPersistenceLockManagerForTests(null);
  });

  it(
    'reports availability and passes the get keys contract through to chrome.storage',
    verifyAvailabilityAndGetContract
  );
  it(
    'wraps set and remove callbacks and rejects when the storage area is unavailable',
    verifySetRemoveAndUnavailableErrors
  );
  it(
    'observes and unsubscribes from storage changes through the shared seam',
    verifyChangeObservationAndSubscription
  );
});
