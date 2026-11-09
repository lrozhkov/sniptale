import '../../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  NATIVE_TRANSFER_SESSIONS_STORE as SESSIONS,
  NATIVE_TRANSFER_CHUNKS_STORE as CHUNKS,
} from '../../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { installPersistenceLockManagerForTests } from '../../../../composition/persistence/infrastructure/mutation-barrier';

import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './contracts';

let database: IDBPDatabase;
let databaseName: string;
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => database,
}));
beforeEach(async () => {
  installPersistenceLockManagerForTests({ request: async (_name, _options, work) => work({}) });
  databaseName = `native-staging-${crypto.randomUUID()}`;
  database = await openDB(databaseName, DB_VERSION, { upgrade: handleDatabaseUpgrade });
});
afterEach(async () => {
  vi.restoreAllMocks();
  database.close();
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
});

it('persists and lists native transfer sessions and chunks', async () => {
  const staging = await import('./staging');
  const session = createSession();
  const chunk = createChunk();

  expect(staging.createNativeTransferExpiry(100)).toBe(86_400_100);
  await staging.putNativeTransferSession(session);
  await expect(staging.getNativeTransferSession('transfer-1')).resolves.toEqual(session);
  await expect(staging.listNativeTransferSessions()).resolves.toEqual([session]);

  await staging.putNativeTransferChunkAndSession({
    chunk,
    session: { ...session, receivedChunkIndexes: [0], updatedAt: 2 },
  });
  await expect(staging.listNativeTransferChunks('transfer-1')).resolves.toEqual([chunk]);
});

it('deletes transfers and cleans up stale sessions', async () => {
  const staging = await import('./staging');
  await database.put(SESSIONS, createSession({ expiresAt: 200, id: 'fresh' }));
  await database.put(SESSIONS, createSession({ expiresAt: 50, id: 'stale' }));
  await database.put(CHUNKS, createChunk({ sessionId: 'stale' }));

  await expect(staging.cleanupStaleNativeTransferSessions(100)).resolves.toEqual(['stale']);
  expect(await database.get(SESSIONS, 'fresh')).toBeDefined();
  expect(await database.get(SESSIONS, 'stale')).toBeUndefined();
  expect(await database.get(CHUNKS, ['stale', 0])).toBeUndefined();

  await staging.deleteNativeTransferSession('fresh');
  expect(await database.get(SESSIONS, 'fresh')).toBeUndefined();
});

it('atomically replaces completed transfers with a tombstone and deletes chunks', async () => {
  const staging = await import('./staging');
  const complete = createSession({ kind: 'recording-complete', totalBytes: 0 });
  await database.put(SESSIONS, createSession({ kind: 'recording' }));
  await database.put(CHUNKS, createChunk());

  await staging.completeNativeTransferSession(complete);

  expect(await database.get(SESSIONS, 'transfer-1')).toEqual(complete);
  expect(await database.get(CHUNKS, ['transfer-1', 0])).toBeUndefined();
});

function createSession(
  patch: Partial<NativeTransferSessionEntry> = {}
): NativeTransferSessionEntry {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    createdAt: 1,
    expiresAt: 1_000,
    filename: 'capture.png',
    id: 'transfer-1',
    kind: 'screenshot',
    metadata: { height: 20, openEditor: false, sourceMode: 'screen', width: 30 },
    mimeType: 'image/png',
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: '0'.repeat(64),
    totalBytes: 8,
    updatedAt: 1,
    ...patch,
  };
}

function createChunk(patch: Partial<NativeTransferChunkEntry> = {}): NativeTransferChunkEntry {
  return {
    blob: new Blob([new Uint8Array([1, 2, 3])]),
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 3,
    chunkSha256: '0'.repeat(64),
    createdAt: 1,
    sessionId: 'transfer-1',
    ...patch,
  };
}

it('retains malformed history authority for recovery instead of expiring it silently', async () => {
  const { cleanupStaleNativeTransferSessions } = await import('./staging');
  const parent = createSession({
    kind: 'recording-complete',
    id: 'invalid-history',
    expiresAt: 50,
    metadata: { width: 640, height: 360, openEditor: false, history: { unexpected: true } },
  });
  await database.put(SESSIONS, parent);
  expect(await cleanupStaleNativeTransferSessions(100)).toEqual([]);
  expect(await database.get(SESSIONS, parent.id)).toEqual(parent);
});
it('rolls back the parent deletion if removal of its staged chunks fails', async () => {
  const { cleanupStaleNativeTransferSessions } = await import('./staging');
  const parent = createSession({ expiresAt: 50 });
  await database.put(SESSIONS, parent);
  await database.put(CHUNKS, createChunk());
  const originalDelete = IDBObjectStore.prototype.delete;
  vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
    this: IDBObjectStore,
    query
  ) {
    if (this.name === CHUNKS) throw new Error('chunk-delete-failed');
    return originalDelete.call(this, query);
  });
  await expect(cleanupStaleNativeTransferSessions(100)).rejects.toThrow('chunk-delete-failed');
  expect(await database.get(SESSIONS, parent.id)).toEqual(parent);
  expect(await database.get(CHUNKS, [parent.id, 0])).toBeDefined();
});
