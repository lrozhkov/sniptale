import { beforeEach, expect, it, vi } from 'vitest';

const { persistBrowserStoredPreferenceMock, readBrowserStoredPreferenceMock } = vi.hoisted(() => ({
  persistBrowserStoredPreferenceMock: vi.fn(),
  readBrowserStoredPreferenceMock: vi.fn(),
}));

vi.mock('./browser-io', () => ({
  persistBrowserStoredPreference: persistBrowserStoredPreferenceMock,
  readBrowserStoredPreference: readBrowserStoredPreferenceMock,
}));

import {
  createPreferenceHydrator,
  createPreferenceAppliers,
  createPreferencePersistor,
  createStorageBackedPreferenceState,
  createStorageChangeHandlers,
  resolveStorageBackedPreferenceBackend,
} from './helpers';

function requireResolver(
  resolver: ((value: Record<string, string>) => void) | null | undefined,
  message: string
): (value: Record<string, string>) => void {
  if (resolver === null || resolver === undefined) {
    throw new Error(message);
  }

  return resolver;
}

function createArgs() {
  return {
    initialCurrentValue: null as string | null,
    isBrowserStorageAvailable: () => false,
    mapCurrentToStoredPreference: (value: string | null) => value,
    mapStoredPreferenceToCurrent: (value: string | null) => value ?? 'fallback',
    normalizeStoredPreference: (value: unknown) => (typeof value === 'string' ? value : null),
    readLocalStoragePreference: vi.fn(() => 'local'),
    storageArea: 'local' as const,
    storageKey: 'theme',
    writeLocalStoragePreference: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('locks the backend on first resolution and keeps that choice for service lifetime', () => {
  const state = createStorageBackedPreferenceState<string | null>(null);
  const browserArgs = {
    ...createArgs(),
    isBrowserStorageAvailable: () => true,
  };

  expect(resolveStorageBackedPreferenceBackend(browserArgs, state)).toBe('browser');
  expect(resolveStorageBackedPreferenceBackend(createArgs(), state)).toBe('browser');
});

it('ignores unrelated browser/local storage changes and applies matching updates', () => {
  const args = {
    ...createArgs(),
    initialCurrentValue: 'light',
    mapStoredPreferenceToCurrent: (value: string | null) => value ?? 'light',
  };
  const state = createStorageBackedPreferenceState<string | null>('light');
  const applyCurrentValue = vi.fn((value: string | null) => {
    state.currentValue = value;
  });
  const { handleBrowserStorageChange, handleLocalStorageChange } = createStorageChangeHandlers({
    args,
    applyCurrentValue,
    state,
  });

  handleBrowserStorageChange({}, 'local');
  handleBrowserStorageChange({ other: { newValue: 'dark' } }, 'local');
  handleBrowserStorageChange({ theme: { newValue: 'dark' } }, 'sync');
  handleBrowserStorageChange({ theme: { newValue: 'dark' } }, 'local');
  handleLocalStorageChange({ key: 'other' } as StorageEvent);
  handleLocalStorageChange({ key: null } as StorageEvent);

  expect(applyCurrentValue).toHaveBeenNthCalledWith(1, 'dark');
  expect(applyCurrentValue).toHaveBeenNthCalledWith(2, 'local');
  expect(applyCurrentValue).toHaveBeenCalledTimes(2);
});

it('hydrates from local storage once and reuses the in-flight browser hydration promise', async () => {
  const applyCurrentValue = vi.fn();
  const cleanupStorageListenerIfUnused = vi.fn();
  const ensureStorageListenerRegistered = vi.fn();
  const localState = createStorageBackedPreferenceState<string | null>(null);
  const localArgs = createArgs();
  const ensureLocalHydrated = createPreferenceHydrator({
    args: localArgs,
    applyCurrentValue,
    cleanupStorageListenerIfUnused,
    ensureStorageListenerRegistered,
    state: localState,
  });

  await ensureLocalHydrated();
  expect(applyCurrentValue).toHaveBeenCalledWith('local');
  expect(cleanupStorageListenerIfUnused).toHaveBeenCalledOnce();

  const browserState = createStorageBackedPreferenceState<string | null>(null);
  const browserArgs = {
    ...createArgs(),
    isBrowserStorageAvailable: () => true,
  };
  let resolveRead: ((value: Record<string, string>) => void) | null = null;
  readBrowserStoredPreferenceMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      })
  );
  const ensureBrowserHydrated = createPreferenceHydrator({
    args: browserArgs,
    applyCurrentValue,
    cleanupStorageListenerIfUnused,
    ensureStorageListenerRegistered,
    state: browserState,
  });

  const first = ensureBrowserHydrated();
  const second = ensureBrowserHydrated();
  requireResolver(resolveRead, 'Expected browser hydration resolver')({ theme: 'dark' });
  await Promise.all([first, second]);

  expect(readBrowserStoredPreferenceMock).toHaveBeenCalledTimes(1);
});

it('applies current and stored preferences with optional notifications', () => {
  const dispatchChange = vi.fn();
  const listener = vi.fn();
  const args = {
    ...createArgs(),
    dispatchChange,
    initialCurrentValue: 'light',
    mapStoredPreferenceToCurrent: (value: string | null) => value ?? 'light',
  };
  const state = createStorageBackedPreferenceState<string | null>('light');
  state.listeners.add(listener);
  const { applyCurrentValue, applyStoredPreference } = createPreferenceAppliers(state, args);

  applyCurrentValue('dark');
  applyStoredPreference(null, { notify: false });

  expect(state.currentValue).toBe('light');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith('dark');
  expect(dispatchChange).toHaveBeenCalledTimes(1);
  expect(dispatchChange).toHaveBeenCalledWith('dark');
});

it('persists stored preferences through the resolved backend and skips null storage values', async () => {
  const localArgs = {
    ...createArgs(),
    initialCurrentValue: 'light',
    mapStoredPreferenceToCurrent: (value: string | null) => value ?? 'light',
  };
  const localState = createStorageBackedPreferenceState<string | null>('light');
  const persistLocalPreference = createPreferencePersistor({
    args: localArgs,
    state: localState,
  });

  await persistLocalPreference('dark');

  expect(localArgs.writeLocalStoragePreference).toHaveBeenCalledWith('dark');
  expect(persistBrowserStoredPreferenceMock).not.toHaveBeenCalled();

  const browserArgs = {
    ...createArgs(),
    initialCurrentValue: 'light',
    isBrowserStorageAvailable: () => true,
    mapCurrentToStoredPreference: (value: string | null) => (value === 'skip' ? null : value),
    mapStoredPreferenceToCurrent: (value: string | null) => value ?? 'light',
  };
  const browserState = createStorageBackedPreferenceState<string | null>('light');
  const persistBrowserPreference = createPreferencePersistor({
    args: browserArgs,
    state: browserState,
  });

  await persistBrowserPreference('dark');
  await persistBrowserPreference('skip');

  expect(persistBrowserStoredPreferenceMock).toHaveBeenCalledTimes(1);
  expect(persistBrowserStoredPreferenceMock).toHaveBeenCalledWith('theme', 'dark');
});

it('resets browser hydration state when async hydration fails', async () => {
  const applyCurrentValue = vi.fn();
  const cleanupStorageListenerIfUnused = vi.fn();
  const ensureStorageListenerRegistered = vi.fn();
  const state = createStorageBackedPreferenceState<string | null>(null);
  const error = new Error('hydrate failed');

  readBrowserStoredPreferenceMock.mockRejectedValueOnce(error);
  const ensureHydrated = createPreferenceHydrator({
    args: {
      ...createArgs(),
      isBrowserStorageAvailable: () => true,
    },
    applyCurrentValue,
    cleanupStorageListenerIfUnused,
    ensureStorageListenerRegistered,
    state,
  });

  await expect(ensureHydrated()).rejects.toThrow('hydrate failed');

  expect(applyCurrentValue).not.toHaveBeenCalled();
  expect(state.hydrationPromise).toBeNull();
  expect(cleanupStorageListenerIfUnused).toHaveBeenCalledOnce();
  expect(ensureStorageListenerRegistered).toHaveBeenCalledOnce();
});
