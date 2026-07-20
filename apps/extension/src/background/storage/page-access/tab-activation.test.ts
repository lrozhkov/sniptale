import { beforeEach, expect, it, vi } from 'vitest';

import {
  createTemporaryTabActivationStore,
  TEMPORARY_ACTIVE_TABS_STORAGE_KEY,
  type TemporaryTabActivationStorage,
} from './tab-activation';

let sessionStorageState: Record<string, unknown>;
const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorageState = {};
  storageGetMock.mockImplementation(async () => ({ ...sessionStorageState }));
  storageSetMock.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(sessionStorageState, items);
  });
});

it('grants and hydrates temporary tab activations through session storage', async () => {
  const store = createStore();

  await store.grant(createTarget(7));

  await expect(store.has(createTarget(7))).resolves.toBe(true);
  await expect(store.hydrate()).resolves.toEqual(new Map([[7, 'https://example.test/7']]));
  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([
    { tabId: 7, updatedAtMs: 1000, url: 'https://example.test/7' },
  ]);
});

it('hydrates legacy stored rows without updated timestamps', async () => {
  sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY] = [
    { tabId: 7, url: 'https://example.test/7' },
    { tabId: 'bad', url: 'https://example.test/bad' },
  ];
  const store = createStore();

  await expect(store.hydrate()).resolves.toEqual(new Map([[7, 'https://example.test/7']]));
});

it('expires stale activation when the tab URL changes', async () => {
  const store = createStore();
  await store.grant(createTarget(7));

  await expect(store.has(createTarget(7, 'https://example.test/changed'))).resolves.toBe(false);

  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([]);
});

it('keeps activation in memory when session storage writes fail', async () => {
  const store = createStore();
  storageSetMock.mockRejectedValueOnce(new Error('session write failed'));

  await store.grant(createTarget(7));

  await expect(store.has(createTarget(7))).resolves.toBe(true);
  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toBeUndefined();
});

it('serializes concurrent grant and clear mutations', async () => {
  const store = createStore();
  const firstWrite = createDeferred<void>();
  storageSetMock.mockImplementationOnce(async (items: Record<string, unknown>) => {
    await firstWrite.promise;
    Object.assign(sessionStorageState, items);
  });

  const grantFirst = store.grant(createTarget(7));
  await flushMicrotasks();
  const clearFirst = store.clear(7);
  await flushMicrotasks();

  expect(storageGetMock).toHaveBeenCalledTimes(1);

  firstWrite.resolve(undefined);
  await Promise.all([grantFirst, clearFirst]);

  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([]);
});

function createStore() {
  return createTemporaryTabActivationStore({
    now: () => 1000,
    storage: {
      get: storageGetMock,
      set: storageSetMock,
    } satisfies TemporaryTabActivationStorage,
  });
}

function createTarget(tabId: number, url = `https://example.test/${tabId}`) {
  return {
    tabId,
    url: new URL(url),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
