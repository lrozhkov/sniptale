import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({ openDB: vi.fn() }));

vi.mock('idb', () => ({ openDB: databaseMocks.openDB }));

function createStore() {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    getAllKeys: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function createDatabase() {
  const stores = { metadata: createStore(), 'video-previews': createStore() };
  return {
    close: vi.fn(),
    createObjectStore: vi.fn(),
    objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
    stores,
    transaction: vi.fn(() => ({
      abort: vi.fn(),
      done: Promise.resolve(),
      objectStore: (name: keyof typeof stores) => stores[name],
    })),
  };
}

function createDeleteRequest(outcome: 'blocked' | 'error' | 'success') {
  const request = {
    error: null,
    onblocked: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onsuccess: null as (() => void) | null,
  };
  queueMicrotask(() => {
    if (outcome === 'blocked') request.onblocked?.();
    else if (outcome === 'error') request.onerror?.();
    else request.onsuccess?.();
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.openDB.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

it('closes and drops its cached connection on versionchange', async () => {
  const first = createDatabase();
  const second = createDatabase();
  databaseMocks.openDB.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const database = createVideoPreviewCacheDatabase();

  await database.mutateOrCreate(async () => undefined);
  const options = databaseMocks.openDB.mock.calls[0]?.[2];
  options.blocking();
  await database.mutateOrCreate(async () => undefined);

  expect(first.close).toHaveBeenCalledOnce();
  expect(databaseMocks.openDB).toHaveBeenCalledTimes(2);
});

it('fails closed when database absence cannot be enumerated', async () => {
  vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn() });
  const { createVideoPreviewCacheDatabase } = await import('./database');

  await expect(createVideoPreviewCacheDatabase().verifyAbsent()).resolves.toBe(false);
});

it('rejects a blocked privacy-erasure deletion', async () => {
  const deleteDatabase = vi.fn(() => createDeleteRequest('blocked'));
  vi.stubGlobal('indexedDB', { databases: vi.fn(), deleteDatabase });
  const { createVideoPreviewCacheDatabase } = await import('./database');

  await expect(createVideoPreviewCacheDatabase().deleteDatabase()).rejects.toThrow(
    'deletion was blocked'
  );
});

it('rejects a blocked database open without retaining the pending connection', async () => {
  const database = createDatabase();
  databaseMocks.openDB.mockImplementationOnce((_name, _version, options) => {
    queueMicrotask(() => options.blocked());
    return new Promise(() => undefined);
  });
  databaseMocks.openDB.mockResolvedValueOnce(database);
  vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const cacheDatabase = createVideoPreviewCacheDatabase();

  await expect(cacheDatabase.mutateOrCreate(async () => undefined)).rejects.toThrow(
    'database open was blocked'
  );
  await expect(cacheDatabase.mutateOrCreate(async () => undefined)).resolves.toBeUndefined();
});

it('aborts the atomic record transaction when a durable request fails', async () => {
  const database = createDatabase();
  database.stores['video-previews'].put.mockRejectedValueOnce(new Error('quota'));
  databaseMocks.openDB.mockResolvedValueOnce(database);
  vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const cacheDatabase = createVideoPreviewCacheDatabase();

  await expect(
    cacheDatabase.mutateOrCreate((transaction) => transaction.putRecord('key', {}))
  ).rejects.toThrow('quota');
  expect(database.transaction.mock.results[0]?.value.abort).toHaveBeenCalledOnce();
});

it('exposes read and mutation transactions only when the cache database exists', async () => {
  const rawDatabase = createDatabase();
  rawDatabase.stores.metadata.get.mockResolvedValue('instance');
  rawDatabase.stores['video-previews'].get.mockResolvedValue({ projectId: 'project-1' });
  rawDatabase.stores['video-previews'].getAllKeys.mockResolvedValue(['key-1']);
  rawDatabase.stores['video-previews'].getAll.mockResolvedValue([{ projectId: 'project-1' }]);
  databaseMocks.openDB.mockResolvedValue(rawDatabase);
  vi.stubGlobal('indexedDB', {
    databases: vi.fn().mockResolvedValue([{ name: 'sniptale-video-preview-cache' }]),
  });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const database = createVideoPreviewCacheDatabase();

  await expect(
    database.readExisting(async (transaction) => ({
      entries: await transaction.listRecordEntries(),
      metadata: await transaction.getMetadata('instance'),
      record: await transaction.getRecord('key-1'),
    }))
  ).resolves.toEqual({
    entries: [{ key: 'key-1', value: { projectId: 'project-1' } }],
    metadata: 'instance',
    record: { projectId: 'project-1' },
  });
  await database.mutateExisting(async (transaction) => {
    await transaction.putMetadata('instance', 'next');
    await transaction.putRecord('key-2', { projectId: 'project-2' });
    await transaction.deleteRecord('key-1');
  });
  expect(rawDatabase.stores.metadata.put).toHaveBeenCalledWith('next', 'instance');
  expect(rawDatabase.stores['video-previews'].put).toHaveBeenCalledWith(
    { projectId: 'project-2' },
    'key-2'
  );
  expect(rawDatabase.stores['video-previews'].delete).toHaveBeenCalledWith('key-1');
  await database.close();
  expect(rawDatabase.close).toHaveBeenCalledOnce();
});

it('does not create the database for read or mutation probes when it is absent', async () => {
  vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const database = createVideoPreviewCacheDatabase();

  await expect(database.readExisting(async () => 'read')).resolves.toBeNull();
  await expect(database.mutateExisting(async () => 'write')).resolves.toBeNull();
  await expect(database.verifyAbsent()).resolves.toBe(true);
  expect(databaseMocks.openDB).not.toHaveBeenCalled();
});

it('creates missing stores during upgrade and resets a terminated connection', async () => {
  const first = createDatabase();
  const second = createDatabase();
  first.objectStoreNames.contains.mockReturnValue(false);
  databaseMocks.openDB.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const database = createVideoPreviewCacheDatabase();

  await database.mutateOrCreate(async () => undefined);
  const options = databaseMocks.openDB.mock.calls[0]?.[2];
  options.upgrade(first);
  expect(first.createObjectStore).toHaveBeenCalledWith('metadata');
  expect(first.createObjectStore).toHaveBeenCalledWith('video-previews');
  options.terminated();
  await database.mutateOrCreate(async () => undefined);
  expect(databaseMocks.openDB).toHaveBeenCalledTimes(2);
});

it('surfaces deletion success, request errors, and missing IndexedDB', async () => {
  const deleteDatabase = vi
    .fn()
    .mockImplementationOnce(() => createDeleteRequest('success'))
    .mockImplementationOnce(() => createDeleteRequest('error'));
  vi.stubGlobal('indexedDB', { databases: vi.fn(), deleteDatabase });
  const { createVideoPreviewCacheDatabase } = await import('./database');
  const database = createVideoPreviewCacheDatabase();

  await expect(database.deleteDatabase()).resolves.toBeUndefined();
  await expect(database.deleteDatabase()).rejects.toThrow('deletion failed');
  vi.stubGlobal('indexedDB', undefined);
  await expect(database.verifyAbsent()).rejects.toThrow('unavailable');
});
