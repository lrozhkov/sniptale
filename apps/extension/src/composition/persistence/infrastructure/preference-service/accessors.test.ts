import { expect, it, vi } from 'vitest';

import {
  createCurrentValueReader,
  createPreferenceSubscription,
  createStoredPreferenceReader,
  createStorageBackedPreferenceState,
} from './helpers';

function requireResolver(resolver: (() => void) | null | undefined, message: string): () => void {
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

it('replays the hydrated value only while the subscription is still active and stable', async () => {
  const cleanupStorageListenerIfUnused = vi.fn();
  const ensureStorageListenerRegistered = vi.fn();
  const activeState = createStorageBackedPreferenceState('light');
  let resolveActiveHydration: (() => void) | null = null;
  const activeSubscribe = createPreferenceSubscription({
    cleanupStorageListenerIfUnused,
    ensureHydrated: () =>
      new Promise<void>((resolve) => {
        resolveActiveHydration = resolve;
      }),
    ensureStorageListenerRegistered,
    state: activeState,
  });
  const activeListener = vi.fn();

  activeSubscribe(activeListener);
  requireResolver(resolveActiveHydration, 'Expected active hydration resolver')();
  await Promise.resolve();
  await Promise.resolve();

  expect(ensureStorageListenerRegistered).toHaveBeenCalledOnce();
  expect(activeListener).toHaveBeenCalledWith('light');

  const staleState = createStorageBackedPreferenceState('light');
  let resolveStaleHydration: (() => void) | null = null;
  const staleSubscribe = createPreferenceSubscription({
    cleanupStorageListenerIfUnused,
    ensureHydrated: () =>
      new Promise<void>((resolve) => {
        resolveStaleHydration = resolve;
      }),
    ensureStorageListenerRegistered,
    state: staleState,
  });
  const staleListener = vi.fn();
  const unsubscribe = staleSubscribe(staleListener);

  staleState.currentValue = 'dark';
  unsubscribe();
  requireResolver(resolveStaleHydration, 'Expected stale hydration resolver')();
  await Promise.resolve();
  await Promise.resolve();

  expect(staleListener).not.toHaveBeenCalled();
  expect(cleanupStorageListenerIfUnused).toHaveBeenCalledOnce();
});

it('reads local stored/current values before hydration and switches to state-backed values after hydration', () => {
  const args = {
    ...createArgs(),
    initialCurrentValue: 'light',
    mapStoredPreferenceToCurrent: (value: string | null, currentValue: string | null) =>
      value ?? currentValue ?? 'light',
    readLocalStoragePreference: vi.fn(() => 'stored-local'),
  };
  const state = createStorageBackedPreferenceState<string | null>('light');
  const storedReader = createStoredPreferenceReader({
    args,
    state,
  });
  const applyStoredPreference = vi.fn<
    (value: string | null, options?: { notify?: boolean }) => void
  >((value: string | null, options?: { notify?: boolean }) => {
    void options;
    state.currentValue = args.mapStoredPreferenceToCurrent(value, state.currentValue);
  });
  const currentValueReader = createCurrentValueReader({
    applyStoredPreference,
    args,
    state,
  });

  expect(storedReader()).toBe('stored-local');
  expect(currentValueReader()).toBe('stored-local');
  expect(applyStoredPreference).toHaveBeenCalledWith('stored-local', { notify: false });

  state.hydrated = true;
  state.currentValue = 'dark';

  expect(storedReader()).toBe('dark');
  expect(currentValueReader()).toBe('dark');
});
