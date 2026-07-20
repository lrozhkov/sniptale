// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { browserStorageMocks } = vi.hoisted(() => ({
  browserStorageMocks: {
    get: vi.fn(),
    isAvailable: vi.fn(),
    set: vi.fn(),
    subscribeToChanges: vi.fn(),
  },
}));

vi.mock('../browser-storage', async (importOriginal) => ({
  ...(await importOriginal()),
  browserStorage: {
    local: {
      get: browserStorageMocks.get,
      isAvailable: browserStorageMocks.isAvailable,
      set: browserStorageMocks.set,
    },
    subscribeToChanges: browserStorageMocks.subscribeToChanges,
  },
}));

const TEST_STORAGE_KEY = 'test-preference';

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: chrome.storage.AreaName
) => void;

function resetPreferenceServiceMocks() {
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.set.mockReset();
  browserStorageMocks.subscribeToChanges.mockReset();
  browserStorageMocks.get.mockResolvedValue({});
  browserStorageMocks.isAvailable.mockReturnValue(false);
  browserStorageMocks.set.mockResolvedValue(undefined);
  browserStorageMocks.subscribeToChanges.mockReturnValue(() => undefined);
  window.localStorage.clear();
}

async function importPreferenceServiceModule() {
  vi.resetModules();
  return import('./index');
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function requireStorageChangeListener(listener: StorageChangeListener | null) {
  if (!listener) {
    throw new Error('Expected storage change listener to be registered');
  }

  return listener;
}

async function createBrowserPreferenceService() {
  const { createStorageBackedPreferenceService } = await importPreferenceServiceModule();
  return createStorageBackedPreferenceService<'light' | 'dark', 'light' | 'dark'>({
    initialCurrentValue: 'light',
    isBrowserStorageAvailable: () => true,
    mapCurrentToStoredPreference: (value) => value,
    mapStoredPreferenceToCurrent: (value, currentValue) => value ?? currentValue,
    normalizeStoredPreference: (value) => (value === 'dark' || value === 'light' ? value : null),
    readLocalStoragePreference: () => null,
    storageArea: 'local',
    storageKey: TEST_STORAGE_KEY,
    writeLocalStoragePreference: () => undefined,
  });
}

beforeEach(() => {
  resetPreferenceServiceMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('hydrates from localStorage fallback and reacts to storage events', async () => {
  const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  window.localStorage.setItem(TEST_STORAGE_KEY, 'dark');
  const { createStorageBackedPreferenceService } = await importPreferenceServiceModule();
  const dispatchChange = vi.fn();
  const service = createStorageBackedPreferenceService<'dark' | 'light' | null, 'dark' | 'light'>({
    dispatchChange,
    initialCurrentValue: null,
    isBrowserStorageAvailable: () => false,
    mapCurrentToStoredPreference: (value) => value,
    mapStoredPreferenceToCurrent: (value) => value,
    normalizeStoredPreference: (value) => (value === 'dark' || value === 'light' ? value : null),
    readLocalStoragePreference: () => {
      const value = window.localStorage.getItem(TEST_STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    },
    storageArea: 'local',
    storageKey: TEST_STORAGE_KEY,
    writeLocalStoragePreference: (value) => {
      window.localStorage.setItem(TEST_STORAGE_KEY, value);
    },
  });
  const listener = vi.fn();

  const unsubscribe = service.subscribe(listener);
  await flushEffects();

  expect(service.getCurrentValue()).toBe('dark');
  expect(service.getStoredPreference()).toBe('dark');
  expect(listener).toHaveBeenCalledWith('dark');

  window.localStorage.setItem(TEST_STORAGE_KEY, 'light');
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: TEST_STORAGE_KEY,
    })
  );

  expect(service.getCurrentValue()).toBe('light');
  expect(dispatchChange).toHaveBeenCalledWith('light');

  unsubscribe();
  expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
});

it('hydrates from browser storage, persists writes, and handles storage change notifications', async () => {
  let storageChangeListener: StorageChangeListener | null = null;
  const unsubscribeStorageChanges = vi.fn();
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockResolvedValue({
    [TEST_STORAGE_KEY]: 'dark',
  });
  browserStorageMocks.subscribeToChanges.mockImplementation((listener) => {
    storageChangeListener = listener;
    return unsubscribeStorageChanges;
  });

  const service = await createBrowserPreferenceService();
  const listener = vi.fn();

  const unsubscribe = service.subscribe(listener);
  await flushEffects();

  expect(browserStorageMocks.get).toHaveBeenCalledWith([TEST_STORAGE_KEY]);
  expect(service.getCurrentValue()).toBe('dark');
  expect(service.getStoredPreference()).toBe('dark');

  await service.setPreference('light');
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    [TEST_STORAGE_KEY]: 'light',
  });

  requireStorageChangeListener(storageChangeListener)(
    {
      [TEST_STORAGE_KEY]: { newValue: 'dark' },
    },
    'local'
  );

  expect(service.getCurrentValue()).toBe('dark');
  expect(listener).toHaveBeenCalledWith('dark');

  unsubscribe();
  expect(unsubscribeStorageChanges).toHaveBeenCalledTimes(1);
});

it('locks into the browser backend for the service lifetime when browser storage is available', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockResolvedValue({
    [TEST_STORAGE_KEY]: 'dark',
  });
  const readLocalStoragePreference = vi.fn(() => 'light' as const);

  const { createStorageBackedPreferenceService } = await importPreferenceServiceModule();
  const service = createStorageBackedPreferenceService<'light' | 'dark', 'light' | 'dark'>({
    initialCurrentValue: 'light',
    isBrowserStorageAvailable: () => true,
    mapCurrentToStoredPreference: (value) => value,
    mapStoredPreferenceToCurrent: (value, currentValue) => value ?? currentValue,
    normalizeStoredPreference: (value) => (value === 'dark' || value === 'light' ? value : null),
    readLocalStoragePreference,
    storageArea: 'local',
    storageKey: TEST_STORAGE_KEY,
    writeLocalStoragePreference: () => undefined,
  });

  await service.ensureHydrated();
  expect(service.getCurrentValue()).toBe('dark');
  expect(readLocalStoragePreference).not.toHaveBeenCalled();

  await service.setPreference('light');
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    [TEST_STORAGE_KEY]: 'light',
  });
});

it('rejects failed persistence writes without mutating current state or notifying listeners', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.set.mockRejectedValue(new Error('persist failed'));

  const { createStorageBackedPreferenceService } = await importPreferenceServiceModule();
  const dispatchChange = vi.fn();
  const service = createStorageBackedPreferenceService<'light' | 'dark', 'light' | 'dark'>({
    dispatchChange,
    initialCurrentValue: 'light',
    isBrowserStorageAvailable: () => true,
    mapCurrentToStoredPreference: (value) => value,
    mapStoredPreferenceToCurrent: (value, currentValue) => value ?? currentValue,
    normalizeStoredPreference: (value) => (value === 'dark' || value === 'light' ? value : null),
    readLocalStoragePreference: () => null,
    storageArea: 'local',
    storageKey: TEST_STORAGE_KEY,
    writeLocalStoragePreference: () => undefined,
  });
  const listener = vi.fn();

  service.subscribe(listener);
  await flushEffects();
  listener.mockClear();

  await expect(service.setPreference('dark')).rejects.toThrow('persist failed');

  expect(service.getCurrentValue()).toBe('light');
  expect(service.getStoredPreference()).toBe('light');
  expect(listener).not.toHaveBeenCalled();
  expect(dispatchChange).not.toHaveBeenCalled();
});

it('keeps the service unhydrated and rejects when browser storage hydration fails', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockRejectedValue(new Error('storage unavailable'));

  const { createStorageBackedPreferenceService } = await importPreferenceServiceModule();
  const service = createStorageBackedPreferenceService<'light' | 'dark', 'light' | 'dark'>({
    initialCurrentValue: 'light',
    isBrowserStorageAvailable: () => true,
    mapCurrentToStoredPreference: (value) => value,
    mapStoredPreferenceToCurrent: (value, currentValue) => value ?? currentValue,
    normalizeStoredPreference: (value) => (value === 'dark' || value === 'light' ? value : null),
    readLocalStoragePreference: () => null,
    storageArea: 'local',
    storageKey: TEST_STORAGE_KEY,
    writeLocalStoragePreference: () => undefined,
  });
  const listener = vi.fn();

  service.subscribe(listener);
  await expect(service.ensureHydrated()).rejects.toThrow('storage unavailable');
  await flushEffects();

  expect(service.getCurrentValue()).toBe('light');
  expect(service.getStoredPreference()).toBeNull();
  expect(listener).not.toHaveBeenCalled();
});
