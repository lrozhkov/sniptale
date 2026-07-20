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

vi.mock('../../composition/persistence/infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal()),
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

beforeEach(() => {
  resetThemeMocks();
  installMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme local storage fallback', () => {
  it('reads localStorage preferences and applies them to the default theme targets', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const theme = await importThemeModule();
    const dispose = theme.initializeAppTheme();
    await Promise.resolve();
    await Promise.resolve();

    expect(theme.getStoredThemePreference()).toBe('dark');
    expect(theme.resolveAppTheme('system')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.body.style.colorScheme).toBe('dark');

    dispose();
  });
});

describe('theme browser storage hydration', () => {
  it('hydrates from browser storage, persists updates, and emits theme change events', async () => {
    let storageChangeListener: StorageChangeListener = () => undefined;
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.canObserveChanges.mockReturnValue(true);
    browserStorageMocks.get.mockResolvedValue({
      [THEME_STORAGE_KEY]: 'dark',
    });
    browserStorageMocks.subscribeToChanges.mockImplementation((listener) => {
      storageChangeListener = listener as StorageChangeListener;
      return () => undefined;
    });

    const eventSpy = vi.fn();
    window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, eventSpy);

    const theme = await importThemeModule();
    const dispose = theme.initializeAppTheme('light');
    await Promise.resolve();
    await Promise.resolve();

    expect(browserStorageMocks.get).toHaveBeenCalledWith([THEME_STORAGE_KEY]);
    expect(browserStorageMocks.subscribeToChanges).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await expect(theme.setAppThemePreference('light')).resolves.toBe('light');
    expect(browserStorageMocks.set).toHaveBeenCalledWith({
      [THEME_STORAGE_KEY]: 'light',
    });
    expect(eventSpy).toHaveBeenCalled();

    storageChangeListener(
      {
        [THEME_STORAGE_KEY]: { newValue: 'dark' },
      },
      'local'
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    dispose();
    window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, eventSpy);
  });
});

describe('theme system preference reactions', () => {
  it('updates only for system preference on media query and storage fallback events', async () => {
    const mediaQuery = installMatchMedia(false);
    const theme = await importThemeModule();
    const target = document.createElement('div');
    document.body.append(target);
    const dispose = theme.initializeAppTheme('system', target);

    expect(target.getAttribute('data-theme')).toBe('light');

    mediaQuery.dispatchChange(true);
    expect(target.getAttribute('data-theme')).toBe('dark');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
      })
    );
    expect(target.getAttribute('data-theme')).toBe('light');

    dispose();
  });
});

describe('theme inline color scheme policy', () => {
  it('can skip inline color-scheme while still updating the theme attribute', async () => {
    const mediaQuery = installMatchMedia(false);
    const theme = await importThemeModule();
    const target = document.createElement('div');
    document.body.append(target);

    const dispose = theme.initializeAppTheme('system', target, {
      applyColorSchemeInline: false,
    });

    expect(target.getAttribute('data-theme')).toBe('light');
    expect(target.style.colorScheme).toBe('');

    mediaQuery.dispatchChange(true);
    expect(target.getAttribute('data-theme')).toBe('dark');
    expect(target.style.colorScheme).toBe('');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
      })
    );
    expect(target.getAttribute('data-theme')).toBe('light');
    expect(target.style.colorScheme).toBe('');

    dispose();
  });
});
