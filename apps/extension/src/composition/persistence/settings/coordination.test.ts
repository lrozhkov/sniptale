import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: storage,
    subscribeToChanges: storage.subscribe,
  },
}));

function installCrossContextLocks() {
  let settingsQueue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: <T>(name: string, _options: unknown, operation: () => Promise<T>) => {
        if (name !== 'sniptale:settings') return Promise.resolve().then(operation);
        const next = settingsQueue.then(operation);
        settingsQueue = next.catch(() => undefined);
        return next;
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installCrossContextLocks();
  storage.subscribe.mockReturnValue(() => undefined);
});

afterEach(() => vi.unstubAllGlobals());

it('serializes independent page instances and preserves disjoint settings patches', async () => {
  let persisted: Record<string, unknown> = { imageFormat: 'png', imageQuality: 100 };
  let releaseFirstWrite: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) await firstWrite;
    persisted = items.sniptale_settings;
  });

  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');

  const imagePatch = firstPage.patchSettings({ imageFormat: 'webp' });
  await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1));
  const qualityPatch = secondPage.patchSettings({ imageQuality: 85 });
  await Promise.resolve();
  expect(storage.get).toHaveBeenCalledTimes(2);
  releaseFirstWrite?.();
  await Promise.all([imagePatch, qualityPatch]);
  expect(persisted).toMatchObject({ imageFormat: 'webp', imageQuality: 85 });
});

it('rejects an obsolete policy edit after a conflicting page commit', async () => {
  let persisted: Record<string, unknown> = {};
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    persisted = items.sniptale_settings;
  });
  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');
  const original = (await firstPage.loadSettings()).localStoragePolicy;
  await firstPage.patchLocalStoragePolicy({ trashCleanupEnabled: true }, original);
  await expect(
    secondPage.patchLocalStoragePolicy({ trashRetentionDays: 7 }, original)
  ).rejects.toBeInstanceOf(secondPage.StaleLocalStoragePolicyError);
  expect((await secondPage.loadSettings()).localStoragePolicy).toMatchObject({
    trashCleanupEnabled: true,
    trashRetentionDays: 30,
  });
});

it('observes only the settings sync key and normalizes removal', async () => {
  vi.stubGlobal('chrome', {});
  const observer: {
    notify?: (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string
    ) => void;
  } = {};
  storage.subscribe.mockImplementation((listener) => {
    observer.notify = listener;
    return () => {
      delete observer.notify;
    };
  });
  const { subscribeToSettingsChanges } = await import('./index');
  const listener = vi.fn();
  const unsubscribe = subscribeToSettingsChanges(listener);
  observer.notify?.(
    {
      sniptale_settings: {
        newValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'local'
  );
  observer.notify?.({ unrelated: { newValue: true } }, 'sync');
  expect(listener).not.toHaveBeenCalled();
  observer.notify?.(
    {
      sniptale_settings: {
        newValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      localStoragePolicy: expect.objectContaining({
        trashCleanupEnabled: true,
        trashRetentionDays: 7,
      }),
    })
  );
  observer.notify?.(
    {
      sniptale_settings: {
        oldValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      localStoragePolicy: expect.objectContaining({
        trashCleanupEnabled: false,
        trashRetentionDays: 30,
      }),
    })
  );
  unsubscribe();
  expect(observer.notify).toBeUndefined();
});
