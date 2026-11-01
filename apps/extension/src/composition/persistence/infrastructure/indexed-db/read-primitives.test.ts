import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { visitIndexedDbStoreRows } from './read-primitives';

beforeEach(() => {
  vi.stubGlobal('IDBKeyRange', {
    lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function source(count: number) {
  const values = Array.from(
    { length: count },
    (_, index) => `row-${String(index).padStart(4, '0')}`
  );
  const select = (query?: IDBKeyRange, limit?: number) =>
    values
      .filter((key) => !query || typeof query.lower !== 'string' || key > query.lower)
      .slice(0, limit);
  return {
    getAll: vi.fn(async (query?: IDBKeyRange, limit?: number) => select(query, limit)),
    getAllKeys: vi.fn(async (query?: IDBKeyRange, limit?: number) => select(query, limit)),
    values,
  };
}

it.each([0, 1, 512, 513, 1024, 1025])(
  'visits %i rows once in bounded primary-key order',
  async (count) => {
    const store = source(count);
    const seen: unknown[] = [];
    await visitIndexedDbStoreRows(store, (row) => {
      seen.push(row);
      return true;
    });
    expect(seen).toEqual(store.values);
    expect(store.getAll).toHaveBeenCalledTimes(Math.floor(count / 512) + 1);
    for (const [, limit] of store.getAll.mock.calls) expect(limit).toBe(512);
    for (const [, limit] of store.getAllKeys.mock.calls) expect(limit).toBe(512);
  }
);

it('stops on refused evidence without reading another page', async () => {
  const store = source(1025);
  const visit = vi.fn().mockReturnValue(false);
  await visitIndexedDbStoreRows(store, visit);
  expect(visit).toHaveBeenCalledOnce();
  expect(store.getAll).toHaveBeenCalledOnce();
});

it('propagates a late request failure for the transaction owner to abort', async () => {
  const store = source(1025);
  store.getAll.mockImplementationOnce(async () => store.values.slice(0, 512));
  store.getAll.mockRejectedValueOnce(new Error('read failed'));
  const visit = vi.fn().mockReturnValue(true);
  await expect(visitIndexedDbStoreRows(store, visit)).rejects.toThrow('read failed');
  expect(visit).toHaveBeenCalledTimes(512);
  expect(store.getAllKeys).toHaveBeenCalledOnce();
});

it('awaits transaction writes and propagates callback failure', async () => {
  const store = source(1025);
  const seen: unknown[] = [];
  await expect(
    visitIndexedDbStoreRows(store, async (row) => {
      await Promise.resolve();
      seen.push(row);
      if (seen.length === 513) throw new Error('write failed');
      return true;
    })
  ).rejects.toThrow('write failed');
  expect(seen).toEqual(store.values.slice(0, 513));
  expect(store.getAll).toHaveBeenCalledTimes(2);
});

it('propagates a key-page failure before visiting its rows', async () => {
  const store = source(1025);
  store.getAllKeys.mockRejectedValueOnce(new Error('keys failed'));
  const visit = vi.fn();
  await expect(visitIndexedDbStoreRows(store, visit)).rejects.toThrow('keys failed');
  expect(visit).not.toHaveBeenCalled();
});
