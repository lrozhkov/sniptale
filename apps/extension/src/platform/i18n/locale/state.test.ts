// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { DEFAULT_LOCALE } from '@sniptale/platform/i18n/config';

const { browserStorageMocks } = vi.hoisted(() => ({
  browserStorageMocks: {
    get: vi.fn(),
    isAvailable: vi.fn(),
    set: vi.fn(),
    subscribeToChanges: vi.fn(),
  },
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: browserStorageMocks.get,
      isAvailable: browserStorageMocks.isAvailable,
      set: browserStorageMocks.set,
    },
    subscribeToChanges: browserStorageMocks.subscribeToChanges,
  },
}));

const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';

function resetLocaleMocks() {
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.set.mockReset();
  browserStorageMocks.subscribeToChanges.mockReset();
  window.localStorage.clear();
}

async function importLocaleStateModule() {
  vi.resetModules();
  return import('./state');
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  resetLocaleMocks();
  browserStorageMocks.get.mockResolvedValue({});
  browserStorageMocks.isAvailable.mockReturnValue(false);
  browserStorageMocks.set.mockResolvedValue(undefined);
  browserStorageMocks.subscribeToChanges.mockReturnValue(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('locale-state local storage access', () => {
  it('reads supported locales from localStorage and ignores unsupported values', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const localeState = await importLocaleStateModule();

    expect(localeState.getStoredLocalePreference()).toBe('en');
    expect(localeState.getCurrentLocale()).toBe('en');

    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    const unsupportedLocaleState = await importLocaleStateModule();

    expect(unsupportedLocaleState.getStoredLocalePreference()).toBeNull();
    expect(unsupportedLocaleState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
  });
});

describe('locale-state hydration', () => {
  it('hydrates from browser storage and registers the shared storage listener once', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockResolvedValue({
      [LOCALE_STORAGE_KEY]: 'en',
    });
    const localeState = await importLocaleStateModule();
    const localeListener = vi.fn();

    const disposeFirst = localeState.subscribeToLocaleChanges(localeListener);
    const disposeSecond = localeState.subscribeToLocaleChanges(vi.fn());
    await flushEffects();

    expect(browserStorageMocks.get).toHaveBeenCalledWith([LOCALE_STORAGE_KEY]);
    expect(browserStorageMocks.subscribeToChanges).toHaveBeenCalledTimes(1);
    expect(localeState.getCurrentLocale()).toBe('en');
    expect(localeState.getStoredLocalePreference()).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');

    disposeFirst();
    disposeSecond();
  });
});

async function verifySetLocalePreferenceFlow() {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  const localeState = await importLocaleStateModule();
  const localeListener = vi.fn();
  const dispose = localeState.subscribeToLocaleChanges(localeListener);
  await flushEffects();

  await localeState.setLocalePreference('en');

  expect(localeState.getCurrentLocale()).toBe('en');
  expect(localeState.getStoredLocalePreference()).toBe('en');
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    [LOCALE_STORAGE_KEY]: 'en',
  });
  expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');

  dispose();
}

async function verifyCrossTabStorageFlow() {
  browserStorageMocks.isAvailable.mockReturnValue(false);
  const localeState = await importLocaleStateModule();
  const localeListener = vi.fn();
  const dispose = localeState.subscribeToLocaleChanges(localeListener);
  await flushEffects();

  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: LOCALE_STORAGE_KEY,
    })
  );

  expect(localeState.getCurrentLocale()).toBe('en');

  window.localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: LOCALE_STORAGE_KEY,
    })
  );

  expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
  expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');
  expect(localeListener.mock.calls.map(([locale]) => locale)).toContain(DEFAULT_LOCALE);

  window.dispatchEvent(
    new CustomEvent(LOCALE_CHANGE_EVENT, {
      detail: { locale: 'en' },
    })
  );

  expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');

  dispose();
}

describe('locale-state persistence and events', () => {
  it(
    'persists locale changes and notifies subscribers through the custom locale event',
    verifySetLocalePreferenceFlow
  );

  it(
    'handles cross-tab storage events and shared browser storage changes',
    verifyCrossTabStorageFlow
  );

  it('rejects failed locale writes without mutating current locale', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.set.mockRejectedValue(new Error('persist failed'));
    const localeState = await importLocaleStateModule();
    const localeListener = vi.fn();
    const dispose = localeState.subscribeToLocaleChanges(localeListener);
    await flushEffects();
    localeListener.mockClear();

    await expect(localeState.setLocalePreference('en')).rejects.toThrow('persist failed');

    expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
    expect(localeState.getStoredLocalePreference()).toBe(DEFAULT_LOCALE);
    expect(localeListener).not.toHaveBeenCalled();

    dispose();
  });
});
