import { afterEach, expect, it, vi } from 'vitest';

import { contentRuntimeShimBrowser } from './content-runtime-shim';

function installChromeShim(payload: Record<string, unknown>) {
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const get = vi.fn((keys: string[], callback: (items: Record<string, unknown>) => void) => {
    callback(Object.fromEntries(keys.map((key) => [key, payload[key]])));
  });

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: { lastError: undefined },
      storage: {
        local: { get },
        sync: { get },
        onChanged: { addListener, removeListener },
      },
    },
  });

  return { addListener, get, removeListener };
}

afterEach(() => {
  vi.resetAllMocks();
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('wraps compact local storage reads for the shim', async () => {
  const { get } = installChromeShim({ key: 'value' });

  await expect(contentRuntimeShimBrowser.getLocalStorage(['key'])).resolves.toEqual({
    key: 'value',
  });

  expect(get).toHaveBeenCalledWith(['key'], expect.any(Function));
});

it('subscribes to shim storage changes through a deterministic unsubscribe', () => {
  const { addListener, removeListener } = installChromeShim({});
  const listener = vi.fn();

  expect(contentRuntimeShimBrowser.canObserveStorageChanges()).toBe(true);
  const unsubscribe = contentRuntimeShimBrowser.subscribeToStorageChanges(listener);
  unsubscribe();

  expect(addListener).toHaveBeenCalledWith(listener);
  expect(removeListener).toHaveBeenCalledWith(listener);
});

it('reads launcher settings from sync through the same narrow native adapter', async () => {
  const { get } = installChromeShim({ sniptale_settings: { pageLaunch: { enabled: true } } });
  await expect(contentRuntimeShimBrowser.getSyncStorage(['sniptale_settings'])).resolves.toEqual({
    sniptale_settings: { pageLaunch: { enabled: true } },
  });
  expect(get).toHaveBeenCalledWith(['sniptale_settings'], expect.any(Function));
});
it('refuses a read after the native storage area becomes unavailable', async () => {
  Reflect.deleteProperty(globalThis, 'chrome');
  await expect(contentRuntimeShimBrowser.getSyncStorage(['key'])).rejects.toThrow('unavailable');
  await expect(contentRuntimeShimBrowser.getLocalStorage(['key'])).rejects.toThrow('unavailable');
});
