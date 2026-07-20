import { beforeEach, expect, it, vi } from 'vitest';

const { browserStorageSessionGetMock, browserStorageSessionSetMock, sessionStorageState } =
  vi.hoisted(() => ({
    browserStorageSessionGetMock: vi.fn(),
    browserStorageSessionSetMock: vi.fn(),
    sessionStorageState: {} as Record<string, unknown>,
  }));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: browserStorageSessionGetMock,
      set: browserStorageSessionSetMock,
    },
  },
}));

import {
  clearPageAccessTabActivation,
  hasTemporaryTabActivation,
  setTemporaryTabActivation,
} from './tab-activation';
import type { SupportedPageTarget } from './target';

const TEMPORARY_ACTIVE_TABS_STORAGE_KEY = 'sniptale_page_access_active_tabs';

beforeEach(async () => {
  Object.keys(sessionStorageState).forEach((key) => delete sessionStorageState[key]);
  browserStorageSessionGetMock.mockImplementation(async () => ({ ...sessionStorageState }));
  browserStorageSessionSetMock.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(sessionStorageState, items);
  });
  await clearPageAccessTabActivation(7);
  await clearPageAccessTabActivation(8);
  vi.clearAllMocks();
});

it('serializes concurrent temporary activation writes before later reads', async () => {
  const firstWrite = createDeferred<void>();
  browserStorageSessionSetMock.mockImplementationOnce(async (items: Record<string, unknown>) => {
    await firstWrite.promise;
    Object.assign(sessionStorageState, items);
  });

  const activateFirst = setTemporaryTabActivation(createTarget(7));
  await flushMicrotasks();
  const activateSecond = setTemporaryTabActivation(createTarget(8));
  await flushMicrotasks();

  expect(browserStorageSessionGetMock).toHaveBeenCalledTimes(1);

  firstWrite.resolve(undefined);
  await Promise.all([activateFirst, activateSecond]);

  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([
    expect.objectContaining({ tabId: 7, url: 'https://example.test/7' }),
    expect.objectContaining({ tabId: 8, url: 'https://example.test/8' }),
  ]);
  await expect(hasTemporaryTabActivation(createTarget(8))).resolves.toBe(true);
});

it('serializes activation and clear mutations without resurrecting cleared tabs', async () => {
  await setTemporaryTabActivation(createTarget(7));
  const firstWrite = createDeferred<void>();
  browserStorageSessionSetMock.mockImplementationOnce(async (items: Record<string, unknown>) => {
    await firstWrite.promise;
    Object.assign(sessionStorageState, items);
  });

  const clear = clearPageAccessTabActivation(7);
  await flushMicrotasks();
  const activateSecond = setTemporaryTabActivation(createTarget(8));
  await flushMicrotasks();

  firstWrite.resolve(undefined);
  await Promise.all([clear, activateSecond]);

  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([
    expect.objectContaining({ tabId: 8, url: 'https://example.test/8' }),
  ]);
  await expect(hasTemporaryTabActivation(createTarget(7))).resolves.toBe(false);
});

function createTarget(tabId: number): SupportedPageTarget {
  const url = `https://example.test/${tabId}`;
  return {
    tab: { id: tabId, url } as chrome.tabs.Tab,
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
