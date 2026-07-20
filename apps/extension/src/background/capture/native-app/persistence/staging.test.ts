import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './contracts';

const stores = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: vi.fn(async () => createDb()),
  })
);

beforeEach(() => {
  stores.chunks.clear();
  stores.sessions.clear();
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
  stores.sessions.set('fresh', createSession({ expiresAt: 200, id: 'fresh' }));
  stores.sessions.set('stale', createSession({ expiresAt: 50, id: 'stale' }));
  stores.chunks.set('stale:0', createChunk({ sessionId: 'stale' }));

  await expect(staging.cleanupStaleNativeTransferSessions(100)).resolves.toEqual(['stale']);
  expect(stores.sessions.has('fresh')).toBe(true);
  expect(stores.sessions.has('stale')).toBe(false);
  expect(stores.chunks.has('stale:0')).toBe(false);

  await staging.deleteNativeTransferSession('fresh');
  expect(stores.sessions.has('fresh')).toBe(false);
});

it('atomically replaces completed transfers with a tombstone and deletes chunks', async () => {
  const staging = await import('./staging');
  const complete = createSession({ kind: 'recording-complete', totalBytes: 0 });
  stores.sessions.set('transfer-1', createSession({ kind: 'recording' }));
  stores.chunks.set('transfer-1:0', createChunk());

  await staging.completeNativeTransferSession(complete);

  expect(stores.sessions.get('transfer-1')).toEqual(complete);
  expect(stores.chunks.has('transfer-1:0')).toBe(false);
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

function createDb() {
  return {
    get: vi.fn(async (_store: string, id: string) => stores.sessions.get(id)),
    getAll: vi.fn(async () => [...stores.sessions.values()]),
    getAllFromIndex: vi.fn(async (_store: string, _index: string, sessionId: string) =>
      [...stores.chunks.values()].filter((chunk) => chunk.sessionId === sessionId)
    ),
    put: vi.fn(async (_store: string, entry: NativeTransferSessionEntry) => {
      stores.sessions.set(entry.id, entry);
    }),
    transaction: vi.fn(() => createTransaction()),
  };
}

function createTransaction() {
  return {
    done: Promise.resolve(),
    objectStore: (storeName: string) => createObjectStore(storeName),
  };
}

function createObjectStore(storeName: string) {
  return {
    delete: vi.fn(async (key: IDBValidKey) => {
      deleteStoreEntry(storeName, key);
    }),
    index: vi.fn(() => ({
      getAllKeys: vi.fn(async (sessionId: string) =>
        [...stores.chunks.values()]
          .filter((chunk) => chunk.sessionId === sessionId)
          .map((chunk) => [chunk.sessionId, chunk.chunkIndex])
      ),
    })),
    put: vi.fn(async (entry: NativeTransferChunkEntry | NativeTransferSessionEntry) => {
      putStoreEntry(entry);
    }),
  };
}

function putStoreEntry(entry: NativeTransferChunkEntry | NativeTransferSessionEntry): void {
  if ('chunkIndex' in entry) {
    stores.chunks.set(`${entry.sessionId}:${entry.chunkIndex}`, entry);
    return;
  }
  stores.sessions.set(entry.id, entry);
}

function deleteStoreEntry(storeName: string, key: IDBValidKey): void {
  if (storeName === 'native_transfer_sessions' && typeof key === 'string') {
    stores.sessions.delete(key);
    return;
  }
  if (Array.isArray(key)) {
    stores.chunks.delete(`${key[0]}:${key[1]}`);
  }
}
