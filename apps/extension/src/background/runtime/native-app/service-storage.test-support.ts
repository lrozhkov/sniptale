import { vi } from 'vitest';

export function createNativeStorage(initialValues: Record<string, unknown> = {}, trusted = true) {
  const values: Record<string, unknown> = {
    ...(trusted
      ? {
          'sniptale.nativeApp.trustedClient': {
            hostName: 'com.sniptale.native_host',
            clientId: 'a'.repeat(64),
            trustVersion: 1,
          },
        }
      : {}),
    ...initialValues,
  };
  return {
    canObserveChanges: vi.fn(() => false),
    local: createStorageArea(values),
    session: createStorageArea({}),
    subscribeToChanges: vi.fn(() => () => undefined),
  };
}

function createStorageArea(values: Record<string, unknown>) {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) =>
      readStorageValues(values, keys)
    ),
    isAvailable: vi.fn(() => true),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
  };
}

export function createChromeStorageArea(
  values: Record<string, unknown>
): chrome.storage.StorageArea {
  const area = {
    clear: vi.fn((callback?: () => void) => {
      for (const key of Object.keys(values)) {
        delete values[key];
      }
      callback?.();
    }),
    get: vi.fn((keys: unknown, callback: (items: Record<string, unknown>) => void) => {
      callback(readStorageValues(values, keys));
    }),
    getBytesInUse: vi.fn((_keys: unknown, callback?: (bytesInUse: number) => void) => {
      callback?.(0);
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete values[key];
      }
      callback?.();
    }),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(values, items);
      callback?.();
    }),
  };
  return area as unknown as chrome.storage.StorageArea;
}

function readStorageValues(
  values: Record<string, unknown>,
  keys: unknown
): Record<string, unknown> {
  if (typeof keys === 'string') {
    return keys in values ? { [keys]: values[keys] } : {};
  }
  if (Array.isArray(keys) && keys.every((key): key is string => typeof key === 'string')) {
    return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
  }
  return { ...values };
}
