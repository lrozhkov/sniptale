import { expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { withIndexedRowProjections } from './indexed-row-projections';
import { ROW_REFERENCE_FIELD } from './row-index-contract';

function databaseFixture() {
  const rows = new Map<string, unknown>();
  const writes = vi.fn();
  const abort = vi.fn();
  const database = {
    transaction: (_names: string[], _mode: IDBTransactionMode) => {
      const before = new Map(rows);
      const restore = () => {
        rows.clear();
        for (const [key, value] of before) rows.set(key, value);
        abort();
      };
      const keyFor = (value: unknown) => {
        if (!isRecord(value) || typeof value['id'] !== 'string')
          throw new Error('Invalid fixture row');
        return value['id'];
      };
      const put = async (value: unknown) => {
        const key = keyFor(value);
        writes(value);
        rows.set(key, structuredClone(value));
        return key;
      };
      const source = {
        get: async (key: IDBValidKey) =>
          typeof key === 'string' ? structuredClone(rows.get(key)) : undefined,
        getAll: async () => structuredClone([...rows.values()]),
        index: (_name: string) => ({ getAll: async (_key: IDBValidKey): Promise<unknown[]> => [] }),
        put,
        add: async (value: unknown) => {
          if (rows.has(keyFor(value))) {
            restore();
            throw new Error('ConstraintError');
          }
          return put(value);
        },
        delete: async (_key: IDBValidKey | IDBKeyRange) => undefined,
        clear: async () => {
          rows.clear();
        },
        openCursor: async () => null,
      };
      return { done: Promise.resolve(), abort: restore, objectStore: (_name: string) => source };
    },
    put: async (_store: string, _value: unknown) => '',
    add: async (_store: string, _value: unknown) => '',
    get: async (_store: string, key: string): Promise<unknown> => structuredClone(rows.get(key)),
    getAll: async (_store: string): Promise<unknown[]> => structuredClone([...rows.values()]),
  };
  return { database: withIndexedRowProjections(database), rows, writes, abort };
}
const asset = (id: string) => ({
  id,
  assetId: `bytes-${id}`,
  createdAt: 1,
  mimeType: 'image/png',
  size: 3,
});

it('keeps source and reference keys atomic across parallel writer transactions', async () => {
  const fixture = databaseFixture();
  const first = fixture.database.transaction(['project_assets'], 'readwrite');
  const second = fixture.database.transaction(['project_assets'], 'readwrite');
  await Promise.all([
    first.objectStore('project_assets').put(asset('first')),
    second.objectStore('project_assets').add(asset('second')),
  ]);
  expect(fixture.writes.mock.calls).toEqual([
    [{ ...asset('first'), [ROW_REFERENCE_FIELD]: ['asset:bytes-first'] }],
    [{ ...asset('second'), [ROW_REFERENCE_FIELD]: ['asset:bytes-second'] }],
  ]);
});

it('rolls back source and index after a late write failure and permits retry', async () => {
  const fixture = databaseFixture();
  const tx = fixture.database.transaction(['project_assets'], 'readwrite');
  await tx.objectStore('project_assets').put(asset('new'));
  await expect(tx.objectStore('project_assets').add(asset('new'))).rejects.toThrow(
    'ConstraintError'
  );
  expect(fixture.rows.size).toBe(0);
  expect(fixture.abort).toHaveBeenCalledOnce();
  await fixture.database.add('project_assets', asset('new'));
  expect(fixture.rows.get('new')).toMatchObject({
    [ROW_REFERENCE_FIELD]: expect.arrayContaining(['asset:bytes-new']),
  });
});

it('recomputes imported fields through database shortcuts and hides only native metadata', async () => {
  const fixture = databaseFixture();
  const raw = {
    ...asset('imported'),
    future: { retain: true },
    [ROW_REFERENCE_FIELD]: ['asset:forged'],
  };
  await fixture.database.put('project_assets', raw);
  expect(await fixture.database.get('project_assets', 'imported')).toEqual({
    ...asset('imported'),
    future: { retain: true },
  });
  expect(await fixture.database.getAll('project_assets')).toEqual([
    { ...asset('imported'), future: { retain: true } },
  ]);
  expect(raw[ROW_REFERENCE_FIELD]).toEqual(['asset:forged']);
  expect(fixture.rows.get('imported')).toMatchObject({
    [ROW_REFERENCE_FIELD]: expect.arrayContaining(['asset:bytes-imported']),
  });
});

it('preserves native read-after-write order for pending workspace mutations', async () => {
  const fixture = databaseFixture();
  const tx = fixture.database.transaction(['video_workspace_history'], 'readwrite');
  const source = tx.objectStore('video_workspace_history');
  const row = { ...asset('baseline'), aggregateId: 'review', ordinal: 0 };
  const written = source.put(row);
  const read = source.get('baseline');
  await written;
  expect(await read).toEqual(row);
});

class NativeCursor {
  readonly key = 'entry';
  readonly primaryKey = 'entry';
  readonly update = vi.fn(async (_value: unknown) => 'entry');
  readonly delete = vi.fn(async () => undefined);
  private remaining = 1;
  constructor(
    readonly source: object,
    readonly value: unknown
  ) {}
  async continue(): Promise<NativeCursor | null> {
    if (this.remaining-- > 0) return this;
    return null;
  }
  advance(_count: number): Promise<NativeCursor | null> {
    return this.continue();
  }
  continuePrimaryKey(_key: IDBValidKey, _primaryKey: IDBValidKey): Promise<NativeCursor | null> {
    return this.continue();
  }
}

function nativeHandlesFixture() {
  const value = { ...asset('entry'), [ROW_REFERENCE_FIELD]: ['asset:bytes-entry'] };
  const get = vi.fn(async (_key?: IDBValidKey): Promise<unknown> => value);
  const getAll = vi.fn(async (_key?: IDBValidKey): Promise<unknown[]> => [value]);
  const index = {
    name: 'retentionReferenceKeys',
    get,
    getAll,
    getKey: vi.fn(async () => 'entry'),
    getAllKeys: vi.fn(async () => ['entry']),
    count: vi.fn(async () => 1),
    openCursor: vi.fn(async (): Promise<NativeCursor | null> => new NativeCursor(index, value)),
    openKeyCursor: vi.fn(async (): Promise<NativeCursor | null> => new NativeCursor(index, value)),
    iterate: vi.fn(() => iterator(index)),
  };
  const source = {
    name: 'source',
    get,
    getAll,
    getKey: index.getKey,
    getAllKeys: index.getAllKeys,
    count: index.count,
    index: vi.fn((_name: string) => index),
    put: vi.fn(async (_value: unknown, _key?: IDBValidKey) => 'entry'),
    add: vi.fn(async (_value: unknown, _key?: IDBValidKey) => 'entry'),
    delete: vi.fn(async (_key: IDBValidKey | IDBKeyRange) => undefined),
    clear: vi.fn(async () => undefined),
    openCursor: vi.fn(async (): Promise<NativeCursor | null> => new NativeCursor(source, value)),
    openKeyCursor: vi.fn(async (): Promise<NativeCursor | null> => new NativeCursor(source, value)),
    iterate: vi.fn(() => iterator(source)),
    [Symbol.asyncIterator]: () => iterator(source),
  };
  function iterator(cursorSource: object) {
    let finished = false;
    return {
      label: 'native-iterator',
      return: vi.fn(async (): Promise<IteratorReturnResult<undefined>> => ({
        done: true,
        value: undefined,
      })),
      next: vi.fn(async (): Promise<IteratorResult<NativeCursor, undefined>> => {
        if (finished) return { done: true, value: undefined };
        finished = true;
        return { done: false, value: new NativeCursor(cursorSource, value) };
      }),
    };
  }
  const done = Promise.withResolvers<void>();
  done.resolve();
  const rawTx = {
    done: done.promise,
    mode: 'readwrite',
    abort: vi.fn(),
    commit: vi.fn(),
    objectStore: vi.fn((_name: string) => source),
  };
  const raw = {
    name: 'native-db',
    close: vi.fn(),
    transaction: vi.fn(
      (_names: string | string[], _mode?: IDBTransactionMode, _options?: IDBTransactionOptions) =>
        rawTx
    ),
    get: vi.fn(async (_name: string, _key: IDBValidKey): Promise<unknown> => value),
    getAll: vi.fn(async (_name: string): Promise<unknown> => [value]),
    getFromIndex: vi.fn(
      async (_name: string, _index: string, _key: IDBValidKey): Promise<unknown> => value
    ),
    getAllFromIndex: vi.fn(
      async (_name: string, _index: string, _key: IDBValidKey): Promise<unknown> => [value]
    ),
    put: vi.fn(async (_name: string, _value: unknown, _key?: IDBValidKey) => 'entry'),
    add: vi.fn(async (_name: string, _value: unknown, _key?: IDBValidKey) => 'entry'),
    delete: vi.fn(async (_name: string, _key: IDBValidKey | IDBKeyRange) => undefined),
    clear: vi.fn(async (_name: string) => undefined),
  };
  return { raw, rawTx, source, index, value, done, db: withIndexedRowProjections(raw) };
}

it('preserves transaction parents, store identity, options, and immediate native request order', async () => {
  const f = nativeHandlesFixture();
  const tx = f.db.transaction('project_assets', 'readwrite', { durability: 'strict' });
  const store = tx.objectStore('project_assets');
  expect(Reflect.get(tx, 'store')).toBe(store);
  expect(Reflect.get(tx, 'db')).toBe(f.db);
  expect(Reflect.get(store, 'transaction')).toBe(tx);
  expect(store.index('retentionReferenceKeys').name).toBe('retentionReferenceKeys');
  expect(Reflect.get(store.index('retentionReferenceKeys'), 'objectStore')).toBe(store);
  const write = store.put(asset('entry'));
  // The first native request must be queued before another transaction can acquire the store.
  expect(f.source.put).toHaveBeenCalledOnce();
  expect(f.raw.transaction).toHaveBeenCalledWith(['project_assets'], 'readwrite', {
    durability: 'strict',
  });
  await write;
  tx.commit();
  expect(f.rawTx.commit).toHaveBeenCalledOnce();
  expect(tx.done).toBe(f.rawTx.done);
  f.db.close();
  expect(f.raw.close).toHaveBeenCalledOnce();
  expect(f.db.name).toBe('native-db');
  const multi = f.db.transaction(['project_assets', 'media_library']);
  expect(Reflect.get(multi, 'store')).toBeUndefined();
  expect(f.raw.transaction).toHaveBeenLastCalledWith(
    ['project_assets', 'media_library'],
    'readonly',
    undefined
  );
});

it('strips native metadata through source and index reads while retaining key query results', async () => {
  const f = nativeHandlesFixture();
  const tx = f.db.transaction('project_assets');
  const store = tx.objectStore('project_assets');
  const index = store.index('retentionReferenceKeys');
  for (const reader of [store, index]) {
    expect(await reader.get('entry')).toEqual(asset('entry'));
    expect(await reader.getAll('entry')).toEqual([asset('entry')]);
    expect(await reader.getKey()).toBe('entry');
    expect(await reader.getAllKeys()).toEqual(['entry']);
    expect(await reader.count()).toBe(1);
  }
  expect(
    await f.db.getFromIndex('project_assets', 'retentionReferenceKeys', 'asset:bytes-entry')
  ).toEqual(asset('entry'));
  expect(
    await f.db.getAllFromIndex('project_assets', 'retentionReferenceKeys', 'asset:bytes-entry')
  ).toEqual([asset('entry')]);
  f.raw.getAll.mockResolvedValueOnce(undefined);
  expect(await f.db.getAll('project_assets')).toBeUndefined();
});

it('preserves cursor continuation and adapted source provenance and refuses indexed cursor writes', async () => {
  const f = nativeHandlesFixture();
  const store = f.db.transaction('project_assets').objectStore('project_assets');
  const index = store.index('retentionReferenceKeys');
  for (const reader of [store, index]) {
    for (const method of ['openCursor', 'openKeyCursor'] as const) {
      const cursor = await reader[method]();
      expect(cursor?.source).toBe(reader);
      expect(cursor?.value).toEqual(asset('entry'));
      expect(cursor?.key).toBe('entry');
      expect(() => cursor?.update(asset('changed'))).toThrow('canonical object store writer');
      expect(() => cursor?.delete()).toThrow('canonical object store writer');
      const next = await cursor?.continue();
      expect(next?.source).toBe(reader);
      expect(await next?.continue()).toBeNull();
    }
    const advancing = await reader.openCursor();
    expect((await advancing?.advance(1))?.source).toBe(reader);
    expect(await advancing?.continuePrimaryKey('entry', 'entry')).toBeNull();
  }
  f.source.openCursor.mockResolvedValueOnce(null);
  expect(await store.openCursor()).toBeNull();
});

it('keeps iterator completion and adapted cursor source identity for source and index iteration', async () => {
  const f = nativeHandlesFixture();
  const store = f.db.transaction('project_assets').objectStore('project_assets');
  const index = store.index('retentionReferenceKeys');
  for (const reader of [store, index]) {
    const iterator = reader.iterate();
    expect(Reflect.apply(Reflect.get(iterator, Symbol.asyncIterator), iterator, [])).toBe(iterator);
    const first = await iterator.next();
    expect(first.value?.value).toEqual(asset('entry'));
    expect(first.value?.source).toBe(reader);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(Reflect.get(iterator, 'label')).toBe('native-iterator');
    expect(await iterator.return()).toEqual({ done: true, value: undefined });
  }
  const values: unknown[] = [];
  for await (const cursor of store) values.push(cursor.value);
  expect(values).toEqual([asset('entry')]);
});

it('preserves unindexed DTO fields, cursor writes, and native delete and clear requests', async () => {
  const f = nativeHandlesFixture();
  const store = f.db.transaction('plain', 'readwrite').objectStore('plain');
  expect(await store.get('entry')).toBe(f.value);
  expect(await store.getAll()).toEqual([f.value]);
  expect(await f.db.get('plain', 'entry')).toBe(f.value);
  expect(await f.db.getAll('plain')).toEqual([f.value]);
  expect(await f.db.getFromIndex('plain', 'index', 'entry')).toBe(f.value);
  expect(await f.db.getAllFromIndex('plain', 'index', 'entry')).toEqual([f.value]);
  await store.put(f.value, 'explicit-key');
  await store.add(f.value);
  expect(f.source.put).toHaveBeenCalledWith(f.value, 'explicit-key');
  expect(f.source.add).toHaveBeenCalledWith(f.value, undefined);
  const cursor = await store.openCursor();
  expect(cursor?.value).toBe(f.value);
  await expect(cursor?.update(f.value)).resolves.toBe('entry');
  await expect(cursor?.delete()).resolves.toBeUndefined();
  await store.delete('entry');
  await store.clear();
  await f.db.delete('plain', 'entry');
  await f.db.clear('plain');
  expect(f.source.delete).toHaveBeenCalledTimes(2);
  expect(f.source.clear).toHaveBeenCalledTimes(2);
});

it('expands only writable workspace scopes and awaits shortcut completion', async () => {
  const f = nativeHandlesFixture();
  const completion = Promise.withResolvers<void>();
  f.rawTx.done = completion.promise;
  f.db.transaction(['video_workspaces'], 'readwrite');
  expect(f.raw.transaction).toHaveBeenLastCalledWith(
    ['video_workspaces', 'video_workspace_history'],
    'readwrite',
    undefined
  );
  f.db.transaction(['video_workspace_history', 'video_workspaces'], 'readwrite');
  expect(f.raw.transaction).toHaveBeenLastCalledWith(
    ['video_workspace_history', 'video_workspaces'],
    'readwrite',
    undefined
  );
  f.db.transaction('video_workspaces');
  expect(f.raw.transaction).toHaveBeenLastCalledWith(['video_workspaces'], 'readonly', undefined);
  let completed = false;
  const write = f.db.put('project_assets', asset('entry')).then(() => {
    completed = true;
  });
  await vi.waitFor(() => expect(f.source.put).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  completion.resolve();
  await write;
  expect(completed).toBe(true);
});

it('aborts failed shortcut writes and preserves the original error even after native abort wins', async () => {
  const f = nativeHandlesFixture();
  const failure = new Error('native put failed');
  f.source.put.mockRejectedValue(failure);
  f.rawTx.abort.mockImplementation(() => {
    throw new Error('already aborted');
  });
  f.rawTx.done = Promise.reject(failure);
  void f.rawTx.done.catch(() => undefined);
  await expect(f.db.put('project_assets', asset('entry'))).rejects.toBe(failure);
  expect(f.rawTx.abort).toHaveBeenCalledOnce();
  expect(f.raw.put).not.toHaveBeenCalled();
});

it('refuses missing writable capabilities and invalid native deletion keys without fallback writes', async () => {
  const f = nativeHandlesFixture();
  Reflect.deleteProperty(f.source, 'put');
  expect(() =>
    f.db
      .transaction('project_assets', 'readwrite')
      .objectStore('project_assets')
      .put(asset('entry'))
  ).toThrow('writable transaction');
  Reflect.deleteProperty(f.source, 'clear');
  await expect(f.db.clear('plain')).rejects.toThrow('Native write method is unavailable');
  expect(f.rawTx.abort).toHaveBeenCalledOnce();
  vi.stubGlobal('IDBKeyRange', class {});
  try {
    await expect(Reflect.apply(f.db.delete, f.db, ['plain', { invalid: true }])).rejects.toThrow(
      'Invalid native deletion key'
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it('routes workspace shortcut deletion and erasure through their scoped native stores', async () => {
  const f = nativeHandlesFixture();
  f.index.getAll.mockResolvedValue([]);
  await f.db.delete('video_workspaces', 'review');
  expect(f.index.getAll).toHaveBeenCalledWith('review');
  expect(f.source.delete).toHaveBeenCalledWith('review');
  expect(f.raw.transaction).toHaveBeenLastCalledWith(
    ['video_workspaces', 'video_workspace_history'],
    'readwrite'
  );
  f.source.openCursor.mockResolvedValue(null);
  await f.db.clear('video_workspace_history');
  expect(f.source.openCursor).toHaveBeenCalledOnce();
  expect(f.source.clear).toHaveBeenCalledOnce();
});

it('aborts a failed serialized workspace write and rejects queued reads without issuing requests', async () => {
  const f = nativeHandlesFixture();
  const failed = Promise.withResolvers<string>();
  f.source.put.mockReturnValue(failed.promise);
  f.rawTx.abort.mockImplementation(() => {
    throw new Error('native abort already won');
  });
  const store = f.db
    .transaction('video_workspace_history', 'readwrite')
    .objectStore('video_workspace_history');
  const write = store.put({ aggregateId: 'review', ordinal: 0 });
  const read = store.get('review');
  const reason = new Error('workspace write rejected');
  failed.reject(reason);
  await expect(write).rejects.toBe(reason);
  await expect(read).rejects.toBe(reason);
  expect(f.rawTx.abort).toHaveBeenCalledOnce();
  expect(f.source.get).not.toHaveBeenCalled();
});

it('refuses invalid native index and iterator handles before using them', () => {
  const f = nativeHandlesFixture();
  Reflect.set(f.source, 'index', () => null);
  Reflect.set(f.source, 'iterate', () => undefined);
  const store = f.db.transaction('project_assets').objectStore('project_assets');
  expect(() => store.index('retentionReferenceKeys')).toThrow('Invalid native index handle');
  expect(() => store.iterate()).toThrow('Invalid native iterator');
  expect(f.source.put).not.toHaveBeenCalled();
});
