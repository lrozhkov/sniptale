// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PersistenceLockManager } from '../../../composition/persistence/infrastructure/mutation-barrier';

const { catalogLoad } = vi.hoisted(() => ({ catalogLoad: vi.fn() }));

vi.mock('../catalog-transport', () => ({ loadCatalogMessages: catalogLoad }));
vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { isAvailable: () => false },
    subscribeToChanges: () => () => undefined,
  },
}));

const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';
const TRANSITION_LOCK_NAME = 'sniptale:persistence:privacy-erasure:transition';
let uninstallLocks: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  catalogLoad.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  uninstallLocks?.();
  uninstallLocks = undefined;
  window.localStorage.clear();
});

it.each([null, 'en'] as const)(
  'finishes a locale write before erasure leaves the preference at %s',
  async (restoredValue) => {
    const pendingCatalog = Promise.withResolvers<Record<string, string>>();
    const catalogRequested = Promise.withResolvers<void>();
    const erasureQueued = Promise.withResolvers<void>();
    const tails = new Map<string, Promise<void>>();
    const locks: PersistenceLockManager = {
      request(name, options, operation) {
        const previous = tails.get(name) ?? Promise.resolve();
        const execution = previous.then(operation);
        tails.set(
          name,
          execution.then(
            () => undefined,
            () => undefined
          )
        );
        // Queue the erasure operation before the test releases catalog preparation.
        if (name === TRANSITION_LOCK_NAME && options.mode === 'exclusive') {
          erasureQueued.resolve();
        }
        return execution;
      },
    };
    const barrier =
      await import('../../../composition/persistence/infrastructure/mutation-barrier');
    barrier.installPersistenceLockManagerForTests(locks);
    uninstallLocks = () => barrier.installPersistenceLockManagerForTests(null);
    catalogLoad.mockImplementation((locale: string) => {
      if (locale === 'ru') {
        catalogRequested.resolve();
        return pendingCatalog.promise;
      }
      return Promise.resolve({ 'common.ready': locale });
    });
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const locale = await import('./state');
    await locale.prepareTranslations('content', 'en');

    const write = locale.setLocalePreference('ru');
    await catalogRequested.promise;
    let valueBeforeErasure: string | null | undefined;
    const erase = barrier.runWithPersistentDataErasureBarrier(() => {
      valueBeforeErasure = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
      if (restoredValue !== null) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, restoredValue);
      }
    });
    await erasureQueued.promise;
    pendingCatalog.resolve({ 'common.ready': 'ru' });
    await Promise.all([write, erase]);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(restoredValue);
    expect(valueBeforeErasure).toBe('ru');
  }
);
