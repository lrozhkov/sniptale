// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';

const { browserStorageMocks } = vi.hoisted(() => ({
  browserStorageMocks: {
    canObserveChanges: vi.fn(),
    get: vi.fn(),
    isAvailable: vi.fn(),
    set: vi.fn(),
    subscribeToChanges: vi.fn(),
  },
}));

vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: browserStorageMocks.canObserveChanges,
    local: {
      get: browserStorageMocks.get,
      isAvailable: browserStorageMocks.isAvailable,
      set: browserStorageMocks.set,
    },
    subscribeToChanges: browserStorageMocks.subscribeToChanges,
  },
}));

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: chrome.storage.AreaName
) => void;

const THEME_STORAGE_KEY = 'sniptale-theme-preference';

function installMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    dispatchChange(nextMatches: boolean) {
      mediaQuery.matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    matches,
    media: '(prefers-color-scheme: dark)',
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return mediaQuery;
}

function resetThemeMocks() {
  browserStorageMocks.canObserveChanges.mockReset();
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.set.mockReset();
  browserStorageMocks.subscribeToChanges.mockReset();
  browserStorageMocks.isAvailable.mockReturnValue(false);
  browserStorageMocks.canObserveChanges.mockReturnValue(false);
  browserStorageMocks.get.mockResolvedValue({});
  browserStorageMocks.set.mockResolvedValue(undefined);
  browserStorageMocks.subscribeToChanges.mockReturnValue(() => undefined);
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.body.style.colorScheme = '';
}

async function importThemeModule() {
  vi.resetModules();
  return import('./index');
}

function setupObservableBrowserStorage(
  storedValue: unknown,
  options?: { rejectGet?: boolean }
): { getStorageChangeListener: () => StorageChangeListener } {
  let storageChangeListener: StorageChangeListener = () => undefined;

  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.canObserveChanges.mockReturnValue(true);
  browserStorageMocks.subscribeToChanges.mockImplementation((listener) => {
    storageChangeListener = listener as StorageChangeListener;
    return () => undefined;
  });

  if (options?.rejectGet) {
    browserStorageMocks.get.mockRejectedValue(new Error('offline'));
  } else {
    browserStorageMocks.get.mockResolvedValue({
      [THEME_STORAGE_KEY]: storedValue,
    });
  }

  return {
    getStorageChangeListener: () => storageChangeListener,
  };
}

beforeEach(() => {
  resetThemeMocks();
  installMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme fallback branches', () => {
  it('falls back to light without matchMedia and ignores invalid localStorage values', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'unexpected');

    const theme = await importThemeModule();
    const primary = document.createElement('div');
    const secondary = document.createElement('div');
    theme.applyScopedThemePreview('dark', [primary, secondary]);

    expect(theme.getStoredThemePreference()).toBeNull();
    expect(theme.resolveAppTheme('system')).toBe('light');
    expect(primary.getAttribute('data-theme')).toBe('dark');
    expect(secondary.style.colorScheme).toBe('dark');
  });

  it('rejects localStorage write failures without applying the theme', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const theme = await importThemeModule();

    expect(theme.getStoredThemePreference()).toBeNull();
    await expect(theme.setAppThemePreference('dark')).rejects.toThrow('blocked');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(getItemSpy).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(setItemSpy).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });
});

describe('theme browser-storage edge cases', () => {
  it('reuses a single storage subscription and ignores unchanged storage updates', async () => {
    const { getStorageChangeListener } = setupObservableBrowserStorage('light');
    const eventSpy = vi.fn();
    window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, eventSpy);

    const theme = await importThemeModule();
    const firstDispose = theme.initializeAppTheme('light');
    const secondDispose = theme.initializeAppTheme('dark');
    await Promise.resolve();
    await Promise.resolve();
    eventSpy.mockClear();

    const storageChangeListener = getStorageChangeListener();

    storageChangeListener({ [THEME_STORAGE_KEY]: { newValue: 'light' } }, 'local');
    storageChangeListener({ other: { newValue: 'dark' } }, 'local');
    storageChangeListener({ [THEME_STORAGE_KEY]: { newValue: 'dark' } }, 'sync');

    expect(browserStorageMocks.subscribeToChanges).toHaveBeenCalledTimes(1);
    expect(eventSpy).toHaveBeenCalledTimes(0);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    firstDispose();
    secondDispose();
    window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, eventSpy);
  });
});

describe('theme hydration failure handling', () => {
  it('recovers from hydration failures and applies normalized storage updates', async () => {
    const mediaQuery = installMatchMedia(true);
    const { getStorageChangeListener } = setupObservableBrowserStorage(undefined, {
      rejectGet: true,
    });

    const theme = await importThemeModule();
    const dispose = theme.initializeAppTheme('system');
    await Promise.resolve();
    await Promise.resolve();
    const storageChangeListener = getStorageChangeListener();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    storageChangeListener({ [THEME_STORAGE_KEY]: { newValue: 'invalid' } }, 'local');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    mediaQuery.dispatchChange(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    dispose();
  });
});
