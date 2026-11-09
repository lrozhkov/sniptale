import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  isNativeAppTrusted,
  trustNativeAppClient,
  forgetNativeAppClient,
  isNativeAppAutoConnectPaused,
  setNativeAppAutoConnectPaused,
} from './native-app-trust';
import { installPersistenceLockManagerForTests } from './infrastructure/mutation-barrier';

const hostName = 'com.sniptale.native_host';
const clientId = 'a'.repeat(64);
function createStorage() {
  const values: Record<string, unknown> = {};
  return {
    isAvailable: () => true,
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const entry of Array.isArray(key) ? key : [key]) delete values[entry];
    }),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  installPersistenceLockManagerForTests(null);
});
afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

it('serializes parallel trust writers and preserves the last authorized installation', async () => {
  const storage = createStorage();
  await Promise.all([
    trustNativeAppClient({ storage, hostName, clientId, isCurrent: () => true }),
    trustNativeAppClient({ storage, hostName, clientId: 'b'.repeat(64), isCurrent: () => true }),
  ]);
  expect(await isNativeAppTrusted(storage, hostName, 'b'.repeat(64))).toBe(true);
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
});

it('does not restore a forgotten pin after a delayed write completes', async () => {
  const storage = createStorage();
  const entered = deferred();
  const release = deferred();
  const write = storage.set.getMockImplementation();
  storage.set.mockImplementationOnce(async (items) => {
    entered.resolve();
    await release.promise;
    await write?.(items);
  });
  let current = true;
  const pending = trustNativeAppClient({ storage, hostName, clientId, isCurrent: () => current });
  await entered.promise;
  current = false;
  const forgotten = forgetNativeAppClient(storage);
  release.resolve();
  expect(await pending).toBe(false);
  await forgotten;
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
});

it('rejects an old consent after deletion and recreation of the same identity', async () => {
  const storage = createStorage();
  await trustNativeAppClient({ storage, hostName, clientId, isCurrent: () => true });
  await forgetNativeAppClient(storage);
  const writes = storage.set.mock.calls.length;
  expect(await trustNativeAppClient({ storage, hostName, clientId, isCurrent: () => false })).toBe(
    false
  );
  expect(storage.set).toHaveBeenCalledTimes(writes);
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
  expect(await trustNativeAppClient({ storage, hostName, clientId, isCurrent: () => true })).toBe(
    true
  );
});

it('permits an exact retry after write failure without trusting another host', async () => {
  const storage = createStorage();
  storage.set.mockRejectedValueOnce(new Error('write failed'));
  const request = { storage, hostName, clientId, isCurrent: () => true };
  await expect(trustNativeAppClient(request)).rejects.toThrow('write failed');
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
  expect(await trustNativeAppClient(request)).toBe(true);
  expect(await isNativeAppTrusted(storage, 'other.host', clientId)).toBe(false);
});

it('rejects malformed persisted pins and invalid identity input', async () => {
  const storage = createStorage();
  await storage.set({
    'sniptale.nativeApp.trustedClient': { clientId, hostName, trustVersion: 2 },
  });
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
  expect(
    await trustNativeAppClient({ storage, hostName, clientId: '../invalid', isCurrent: () => true })
  ).toBe(false);
});

it('serializes session Quit and resume without changing persistent trust', async () => {
  const storage = createStorage();
  await Promise.all([
    setNativeAppAutoConnectPaused(storage, true, () => true),
    setNativeAppAutoConnectPaused(storage, false, () => true),
  ]);
  expect(await isNativeAppAutoConnectPaused(storage)).toBe(false);
  expect(await isNativeAppTrusted(storage, hostName, clientId)).toBe(false);
});

it('does not recreate an invalidated session pause after erasure or replacement', async () => {
  const storage = createStorage();
  expect(await setNativeAppAutoConnectPaused(storage, true, () => false)).toBe(false);
  expect(storage.set).not.toHaveBeenCalled();
});

it('preserves a session pause after resume failure and permits an explicit retry', async () => {
  const storage = createStorage();
  await setNativeAppAutoConnectPaused(storage, true, () => true);
  storage.remove.mockRejectedValueOnce(new Error('session unavailable'));
  await expect(setNativeAppAutoConnectPaused(storage, false, () => true)).rejects.toThrow(
    'session unavailable'
  );
  expect(await isNativeAppAutoConnectPaused(storage)).toBe(true);
  expect(await setNativeAppAutoConnectPaused(storage, false, () => true)).toBe(true);
  expect(await isNativeAppAutoConnectPaused(storage)).toBe(false);
});
