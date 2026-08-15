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

function createSerializedLockManager() {
  const queues = new Map<string, Promise<void>>();
  return {
    request<T>(
      name: string,
      _options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ): Promise<T> {
      const execution = (queues.get(name) ?? Promise.resolve()).then(operation);
      queues.set(
        name,
        execution.then(
          () => undefined,
          () => undefined
        )
      );
      return execution;
    },
  };
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
    const dispose = theme.initializeExtensionPageTheme();
    await Promise.resolve();
    await Promise.resolve();

    expect(theme.getStoredThemePreference()).toBe('dark');
    expect(theme.resolveAppTheme('system')).toBe('light');
    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.body.style.colorScheme).toBe('dark');

    dispose();
  });
});

describe('theme browser storage hydration', () => {
  it('does not read or mirror an extension-page paint hint from the shared initializer', async () => {
    let releaseStorage!: (value: Record<string, unknown>) => void;
    browserStorageMocks.isAvailable.mockReturnValue(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    installMatchMedia(true);
    browserStorageMocks.get.mockReturnValue(
      new Promise((resolve) => {
        releaseStorage = resolve;
      })
    );

    const theme = await importThemeModule();
    const dispose = theme.initializeAppTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    releaseStorage({ [THEME_STORAGE_KEY]: 'dark' });
    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });
    dispose();
  });

  it('uses the synchronous paint hint while browser storage hydrates in the background', async () => {
    let releaseStorage!: (value: Record<string, unknown>) => void;
    browserStorageMocks.isAvailable.mockReturnValue(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    installMatchMedia(true);
    browserStorageMocks.get.mockReturnValue(
      new Promise((resolve) => {
        releaseStorage = resolve;
      })
    );

    const theme = await importThemeModule();
    const dispose = theme.initializeExtensionPageTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    releaseStorage({ [THEME_STORAGE_KEY]: 'dark' });

    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });
    dispose();
  });

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
    const dispose = theme.initializeExtensionPageTheme('light');
    await Promise.resolve();
    await Promise.resolve();

    expect(browserStorageMocks.get).toHaveBeenCalledWith([THEME_STORAGE_KEY]);
    expect(browserStorageMocks.subscribeToChanges).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    browserStorageMocks.get.mockResolvedValue({ [THEME_STORAGE_KEY]: 'light' });
    await expect(theme.setAppThemePreference('light')).resolves.toBe('light');
    expect(browserStorageMocks.set).toHaveBeenCalledWith({
      [THEME_STORAGE_KEY]: 'light',
    });
    expect(eventSpy).toHaveBeenCalled();

    browserStorageMocks.get.mockResolvedValue({ [THEME_STORAGE_KEY]: 'dark' });
    storageChangeListener(
      {
        [THEME_STORAGE_KEY]: { newValue: 'dark' },
      },
      'local'
    );

    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    dispose();
    window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, eventSpy);
  });

  it('drops a stale paint hint when authoritative storage is absent', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    installMatchMedia(true);
    browserStorageMocks.get.mockResolvedValue({});

    const theme = await importThemeModule();
    const dispose = theme.initializeExtensionPageTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });
    dispose();
  });

  it('does not recreate a paint hint queued behind privacy erasure', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    let authoritativeTheme: Record<string, unknown> = {
      [THEME_STORAGE_KEY]: 'light',
    };
    browserStorageMocks.get.mockImplementation(async () => authoritativeTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    vi.resetModules();
    const { reconcileThemePaintHint } = await import('./preference-service');
    const { installPersistenceLockManagerForTests, runWithPersistentDataErasureBarrier } =
      await import('../../composition/persistence/infrastructure/mutation-barrier');
    installPersistenceLockManagerForTests(createSerializedLockManager());
    let releaseErasure!: () => void;
    let markErasureEntered!: () => void;
    const erasureEntered = new Promise<void>((resolve) => {
      markErasureEntered = resolve;
    });
    const erasureGate = new Promise<void>((resolve) => {
      releaseErasure = resolve;
    });

    const erasure = runWithPersistentDataErasureBarrier(async () => {
      authoritativeTheme = {};
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      markErasureEntered();
      await erasureGate;
    });
    await erasureEntered;
    const reconciliation = reconcileThemePaintHint();
    releaseErasure();
    await Promise.all([erasure, reconciliation]);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    installPersistenceLockManagerForTests(null);
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
