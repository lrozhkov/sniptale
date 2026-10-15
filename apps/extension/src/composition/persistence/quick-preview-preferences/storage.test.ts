import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../../features/video/preview/quick-preferences';
import {
  createQuickPreviewPreferencesStorage,
  QUICK_PREVIEW_PREFERENCES_STORAGE_KEY as KEY,
} from './storage';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  installPersistenceLockManagerForTests(null);
});
afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(value: unknown = undefined) {
  let stored = value;
  const get = vi.fn(async () => ({ [KEY]: stored }));
  const set = vi.fn(async (items: Record<string, unknown>, permit?: PersistenceMutationPermit) => {
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    stored = items[KEY];
  });
  const store = createQuickPreviewPreferencesStorage({ get, set });
  return {
    store,
    get,
    set,
    read: () => stored,
    erase: () => {
      stored = undefined;
    },
  };
}

it('loads and normalizes only its isolated key without repair writes', async () => {
  const f = fixture({ frameRate: '24', showFrameRate: 'invalid', content: 'not retained' });
  expect(await f.store.load()).toEqual({
    preferences: { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, frameRate: '24' },
    invalidFieldCount: 1,
  });
  expect(f.get).toHaveBeenCalledExactlyOnceWith([KEY]);
  expect(f.set).not.toHaveBeenCalled();
});

it('rejects incomplete or unknown fields before storage or permit acquisition', async () => {
  const request = vi.fn(async () => {
    throw new Error('must not acquire');
  });
  installPersistenceLockManagerForTests({ request });
  const f = fixture();
  await expect(f.store.save({ frameRate: '15' })).rejects.toThrow('Invalid quick preview');
  await expect(f.store.save({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES, extra: true })).rejects.toThrow(
    'Invalid quick preview'
  );
  expect(request).not.toHaveBeenCalled();
  expect(f.set).not.toHaveBeenCalled();
});

it('captures snapshots, orders writes and recovers the queue after a failed write', async () => {
  const f = fixture();
  const gate = deferred();
  f.set.mockImplementationOnce(async () => {
    await gate.promise;
    throw new Error('disk failure');
  });
  const first = f.store.save(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  const failure = expect(first).rejects.toThrow('disk failure');
  const next = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, showFrameRate: true };
  const second = f.store.save(next);
  next.showFrameRate = false;
  await vi.waitFor(() => expect(f.set).toHaveBeenCalledTimes(1));
  gate.resolve();
  await failure;
  await second;
  expect(f.read()).toEqual({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES, showFrameRate: true });
  expect(f.set).toHaveBeenCalledTimes(2);
});

it('drains admitted queued saves before erasure and refuses saves during erasure', async () => {
  const f = fixture();
  const writeGate = deferred(),
    eraseGate = deferred(),
    eraseEntered = deferred();
  const events: string[] = [];
  f.set.mockImplementationOnce(async (items, permit) => {
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    events.push('first-start');
    await writeGate.promise;
    events.push('first-end');
    // The second admitted snapshot is the one that would resurrect after erasure if admitted late.
    expect(items[KEY]).toEqual(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  });
  const first = f.store.save(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  const second = f.store.save({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES, frameRate: '15' });
  await vi.waitFor(() => expect(events).toEqual(['first-start']));
  const erase = runWithPersistentDataErasureBarrier(async () => {
    expect(f.read()).toEqual({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES, frameRate: '15' });
    events.push('erase');
    f.erase();
    eraseEntered.resolve();
    await eraseGate.promise;
  });
  writeGate.resolve();
  await Promise.all([first, second, eraseEntered.promise]);
  await expect(
    f.store.save({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES, frameRate: '60' })
  ).rejects.toThrow('refused during erasure');
  eraseGate.resolve();
  await erase;
  expect(events).toEqual(['first-start', 'first-end', 'erase']);
  expect(f.read()).toBeUndefined();
  expect(f.set).toHaveBeenCalledTimes(2);
  await f.store.save(DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(f.read()).toEqual(DEFAULT_QUICK_PREVIEW_PREFERENCES);
});

it('reports unavailable storage and mutation coordination without silently persisting', async () => {
  const f = fixture();
  f.get.mockRejectedValue(new Error('unavailable'));
  await expect(f.store.load()).rejects.toThrow('unavailable');
  f.set.mockRejectedValue(new Error('unavailable'));
  await expect(f.store.save(DEFAULT_QUICK_PREVIEW_PREFERENCES)).rejects.toThrow('unavailable');
  installPersistenceLockManagerForTests({
    request: () => {
      throw new Error('coordination unavailable');
    },
  });
  await expect(f.store.save(DEFAULT_QUICK_PREVIEW_PREFERENCES)).rejects.toThrow(
    'coordination unavailable'
  );
});
