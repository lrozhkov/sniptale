import { afterEach, expect, it, vi } from 'vitest';
import { createEventHistoryDatabase } from './event-history-database';
const mocks = vi.hoisted(() => ({ openDB: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.openDB }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fixture(exists = true) {
  vi.stubGlobal('indexedDB', {
    databases: async () => (exists ? [{ name: 'sniptale-event-history' }] : []),
  });
  const store = () => ({
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(1),
    clear: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
  });
  const stores = { state: store(), active: store(), archives: store(), catalog: store() };
  const tx = {
    abort: vi.fn(),
    done: Promise.resolve(),
    objectStore: (name: keyof typeof stores) => stores[name],
  };
  const native = {
    close: vi.fn(),
    transaction: vi.fn(() => tx),
    get: vi.fn().mockResolvedValue('value'),
    getAll: vi.fn().mockResolvedValue(['row']),
    createObjectStore: vi.fn(),
  };
  mocks.openDB.mockResolvedValue(native);
  return { stores, tx, native, db: createEventHistoryDatabase() };
}
it('keeps absence reads, erasure and verification write-free', async () => {
  const f = fixture(false);
  expect(await f.db.readState()).toBeUndefined();
  expect(await f.db.readActive()).toEqual([]);
  expect(await f.db.list()).toEqual([]);
  expect(await f.db.readArchive('key')).toBeUndefined();
  await f.db.erase();
  expect(await f.db.verifyEmpty()).toBe(true);
  expect(mocks.openDB).not.toHaveBeenCalled();
});
it('publishes active replacement, archive and eviction in one transaction', async () => {
  const f = fixture();
  const blob = new Blob(['zip']);
  await f.db.commit(
    { version: 1 },
    'rows',
    true,
    { id: 'new', blob, metadata: { bytes: blob.size } },
    ['old']
  );
  expect(f.native.transaction).toHaveBeenCalledExactlyOnceWith(
    ['state', 'active', 'archives', 'catalog'],
    'readwrite'
  );
  expect(f.stores.active.clear).toHaveBeenCalledOnce();
  expect(f.stores.active.add).toHaveBeenCalledWith('rows');
  expect(f.stores.archives.put).toHaveBeenCalledWith(blob, 'new');
  expect(f.stores.catalog.delete).toHaveBeenCalledWith('old');
  expect(f.stores.archives.delete).toHaveBeenCalledWith('old');
  expect(f.native.close).toHaveBeenCalledOnce();
  const upgrade = mocks.openDB.mock.calls[0]?.[2].upgrade;
  upgrade(f.native);
  expect(f.native.createObjectStore.mock.calls).toEqual([
    ['state'],
    ['active', { autoIncrement: true }],
    ['archives'],
    ['catalog'],
  ]);
});
it('appends without clearing prior active chunks or touching immutable archives', async () => {
  const f = fixture();
  await f.db.commit({}, 'next', false, null, []);
  expect(f.stores.active.clear).not.toHaveBeenCalled();
  expect(f.stores.archives.put).not.toHaveBeenCalled();
  await f.db.commit({}, '', false, null, []);
  expect(f.stores.active.add).toHaveBeenCalledOnce();
});
it.each([false, true])(
  'aborts failed publication and closes even when abort throws: %s',
  async (abortThrows) => {
    const f = fixture();
    f.stores.archives.put.mockRejectedValueOnce(new Error('quota'));
    if (abortThrows)
      f.tx.abort.mockImplementation(() => {
        throw new Error('already closed');
      });
    await expect(
      f.db.commit({}, 'next', true, { id: 'new', blob: new Blob(), metadata: {} }, [])
    ).rejects.toThrow('quota');
    expect(f.tx.abort).toHaveBeenCalledOnce();
    expect(f.native.close).toHaveBeenCalledOnce();
  }
);
it('reads the correct stores and closes all short-lived connections', async () => {
  const f = fixture();
  expect(await f.db.readState()).toBe('value');
  expect(await f.db.readArchive('archive')).toBe('value');
  expect(await f.db.readActive()).toEqual(['row']);
  expect(await f.db.list()).toEqual(['row']);
  expect(f.native.get.mock.calls).toEqual([
    ['state', 'active'],
    ['archives', 'archive'],
  ]);
  expect(f.native.getAll.mock.calls).toEqual([['active'], ['catalog']]);
  expect(f.native.close).toHaveBeenCalledTimes(4);
});
it('clears every store and refuses successful verification when a blob remains', async () => {
  const f = fixture();
  await f.db.erase();
  for (const store of Object.values(f.stores)) expect(store.clear).toHaveBeenCalledOnce();
  expect(await f.db.verifyEmpty()).toBe(true);
  f.stores.archives.count.mockResolvedValue(1);
  expect(await f.db.verifyEmpty()).toBe(false);
});
it('propagates unavailable and failed opens without claiming erasure', async () => {
  vi.stubGlobal('indexedDB', undefined);
  await expect(createEventHistoryDatabase().verifyEmpty()).rejects.toThrow('unavailable');
  const f = fixture();
  mocks.openDB.mockRejectedValueOnce(new Error('denied'));
  await expect(f.db.erase()).rejects.toThrow('denied');
});
