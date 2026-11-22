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

const { catalogLoad } = vi.hoisted(() => ({ catalogLoad: vi.fn() }));
vi.mock('../catalog-transport', () => ({ loadCatalogMessages: catalogLoad }));

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
let browserStorageValues: Record<string, unknown> = {};
let browserStorageChangeListener:
  | ((changes: Record<string, { newValue?: unknown }>, areaName: chrome.storage.AreaName) => void)
  | null = null;

function resetLocaleMocks() {
  catalogLoad.mockReset();
  catalogLoad.mockImplementation(async (locale: string) => ({ 'common.ready': locale }));
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.set.mockReset();
  browserStorageMocks.subscribeToChanges.mockReset();
  browserStorageValues = {};
  browserStorageChangeListener = null;
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
  browserStorageMocks.get.mockImplementation(async () => ({ ...browserStorageValues }));
  browserStorageMocks.isAvailable.mockReturnValue(false);
  browserStorageMocks.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(browserStorageValues, values);
  });
  browserStorageMocks.subscribeToChanges.mockImplementation((listener) => {
    browserStorageChangeListener = listener;
    return () => undefined;
  });
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

    window.localStorage.setItem(LOCALE_STORAGE_KEY, '__unsupported__');
    const unsupportedLocaleState = await importLocaleStateModule();

    expect(unsupportedLocaleState.getStoredLocalePreference()).toBeNull();
    expect(unsupportedLocaleState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
  });
});

describe('locale-state hydration', () => {
  it('supports explicit runtime hydration before localized background work', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockResolvedValue({ [LOCALE_STORAGE_KEY]: 'en' });
    const localeState = await importLocaleStateModule();

    await localeState.ensureLocaleHydrated();

    expect(localeState.getCurrentLocale()).toBe('en');
  });

  it('seeds the pre-hydration locale from the paint hint and reconciles it to browser storage', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockResolvedValue({
      [LOCALE_STORAGE_KEY]: 'en',
    });
    window.localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
    const localeState = await importLocaleStateModule();
    const localeListener = vi.fn();

    expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);

    const dispose = localeState.subscribeToLocaleChanges(localeListener);
    await vi.waitFor(() => {
      expect(localeState.getCurrentLocale()).toBe('en');
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
      expect(localeListener).toHaveBeenCalledWith('en');
    });

    dispose();
  });

  it('hydrates from browser storage and registers the shared storage listener once', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockResolvedValue({
      [LOCALE_STORAGE_KEY]: 'en',
    });
    const localeState = await importLocaleStateModule();
    const localeListener = vi.fn();

    const disposeFirst = localeState.subscribeToLocaleChanges(localeListener);
    const disposeSecond = localeState.subscribeToLocaleChanges(vi.fn());
    await vi.waitFor(() => {
      expect(browserStorageMocks.get).toHaveBeenCalledWith([LOCALE_STORAGE_KEY]);
      expect(browserStorageMocks.subscribeToChanges).toHaveBeenCalledTimes(1);
      expect(localeState.getCurrentLocale()).toBe('en');
      expect(localeState.getStoredLocalePreference()).toBe('en');
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
      expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');
    });

    disposeFirst();
    disposeSecond();
  });

  it('removes the advisory paint hint when browser-storage authority is erased', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageValues[LOCALE_STORAGE_KEY] = 'en';
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const localeState = await importLocaleStateModule();
    const dispose = localeState.subscribeToLocaleChanges(vi.fn());
    await vi.waitFor(() => expect(localeState.getCurrentLocale()).toBe('en'));

    delete browserStorageValues[LOCALE_STORAGE_KEY];
    browserStorageChangeListener?.({ [LOCALE_STORAGE_KEY]: { newValue: undefined } }, 'local');

    await vi.waitFor(() => {
      expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    });

    dispose();
  });
});

describe('prepared locale activation', () => {
  it('prepares only the selected profile and English fallback before use', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
    const locale = await importLocaleStateModule();
    await locale.prepareTranslations('content');
    expect(catalogLoad.mock.calls).toEqual([
      ['en', 'content'],
      ['ru', 'content'],
    ]);
    expect(locale.getCurrentLocale()).toBe('ru');
    expect(locale.readPreparedTranslation('ru', 'common.ready')).toBe('ru');
  });

  it('keeps the ready locale and stored preference after failed preparation', async () => {
    const locale = await importLocaleStateModule();
    await locale.prepareTranslations('content');
    catalogLoad.mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(locale.setLocalePreference('ru')).rejects.toThrow('catalog unavailable');
    expect(locale.getCurrentLocale()).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).not.toBe('ru');
    expect(locale.readPreparedTranslation('en', 'common.ready')).toBe('en');
    await locale.setLocalePreference('ru');
    expect(locale.getCurrentLocale()).toBe('ru');
    expect(locale.readPreparedTranslation('ru', 'common.ready')).toBe('ru');
  });

  it('does not persist a superseded choice when its catalog completes late', async () => {
    const locale = await importLocaleStateModule();
    const barrier =
      await import('../../../composition/persistence/infrastructure/mutation-barrier');
    barrier.installPersistenceLockManagerForTests({
      async request(_name, options, operation) {
        expect(options.mode).toBe('shared');
        return operation();
      },
    });
    try {
      await locale.prepareTranslations('content');
      let complete!: (messages: unknown) => void;
      catalogLoad.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          })
      );
      const older = locale.setLocalePreference('ru');
      await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
      await locale.setLocalePreference('en');
      complete({ 'common.ready': 'ru' });
      await older;
      expect(locale.getCurrentLocale()).toBe('en');
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    } finally {
      barrier.installPersistenceLockManagerForTests(null);
    }
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
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    [LOCALE_STORAGE_KEY]: 'en',
  });
  await vi.waitFor(() => {
    expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');
  });

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
  await vi.waitFor(() => {
    expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');
  });

  window.localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: LOCALE_STORAGE_KEY,
    })
  );

  expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
  await vi.waitFor(() => {
    expect(localeListener.mock.calls.map(([locale]) => locale)).toContain('en');
    expect(localeListener.mock.calls.map(([locale]) => locale)).toContain(DEFAULT_LOCALE);
  });

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
    await vi.waitFor(() => expect(localeListener).toHaveBeenCalled());
    localeListener.mockClear();

    await expect(localeState.setLocalePreference('en')).rejects.toThrow('persist failed');

    expect(localeState.getCurrentLocale()).toBe(DEFAULT_LOCALE);
    expect(localeState.getStoredLocalePreference()).toBe(DEFAULT_LOCALE);
    expect(localeListener).not.toHaveBeenCalled();

    dispose();
  });
});
