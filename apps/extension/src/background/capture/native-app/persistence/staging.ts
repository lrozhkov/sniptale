import {
  initDB,
  NATIVE_TRANSFER_CHUNKS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './contracts';

const NATIVE_TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

export function createNativeTransferExpiry(now = Date.now()): number {
  return now + NATIVE_TRANSFER_TTL_MS;
}

export async function putNativeTransferSession(entry: NativeTransferSessionEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(NATIVE_TRANSFER_SESSIONS_STORE, entry));
}

export async function getNativeTransferSession(
  id: string
): Promise<NativeTransferSessionEntry | undefined> {
  const db = await initDB();
  return db.get(NATIVE_TRANSFER_SESSIONS_STORE, id) as Promise<
    NativeTransferSessionEntry | undefined
  >;
}

export async function listNativeTransferSessions(): Promise<NativeTransferSessionEntry[]> {
  const db = await initDB();
  return db.getAll(NATIVE_TRANSFER_SESSIONS_STORE) as Promise<NativeTransferSessionEntry[]>;
}

export async function putNativeTransferChunkAndSession(args: {
  chunk: NativeTransferChunkEntry;
  session: NativeTransferSessionEntry;
}): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [NATIVE_TRANSFER_CHUNKS_STORE, NATIVE_TRANSFER_SESSIONS_STORE],
      'readwrite'
    );
    await tx.objectStore(NATIVE_TRANSFER_CHUNKS_STORE).put(args.chunk);
    await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put(args.session);
    await tx.done;
  });
}

export async function listNativeTransferChunks(
  sessionId: string
): Promise<NativeTransferChunkEntry[]> {
  const db = await initDB();
  return db.getAllFromIndex(NATIVE_TRANSFER_CHUNKS_STORE, 'sessionId', sessionId) as Promise<
    NativeTransferChunkEntry[]
  >;
}

export async function deleteNativeTransferSession(id: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [NATIVE_TRANSFER_SESSIONS_STORE, NATIVE_TRANSFER_CHUNKS_STORE],
      'readwrite'
    );
    await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).delete(id);
    const chunkKeys = await tx
      .objectStore(NATIVE_TRANSFER_CHUNKS_STORE)
      .index('sessionId')
      .getAllKeys(id);
    await Promise.all(
      chunkKeys.map((key) => tx.objectStore(NATIVE_TRANSFER_CHUNKS_STORE).delete(key))
    );
    await tx.done;
  });
}

export async function completeNativeTransferSession(
  entry: NativeTransferSessionEntry
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [NATIVE_TRANSFER_SESSIONS_STORE, NATIVE_TRANSFER_CHUNKS_STORE],
      'readwrite'
    );
    await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put(entry);
    const chunkKeys = await tx
      .objectStore(NATIVE_TRANSFER_CHUNKS_STORE)
      .index('sessionId')
      .getAllKeys(entry.id);
    await Promise.all(
      chunkKeys.map((key) => tx.objectStore(NATIVE_TRANSFER_CHUNKS_STORE).delete(key))
    );
    await tx.done;
  });
}

export async function cleanupStaleNativeTransferSessions(now = Date.now()): Promise<string[]> {
  const db = await initDB();
  const sessions = (await db.getAll(
    NATIVE_TRANSFER_SESSIONS_STORE
  )) as NativeTransferSessionEntry[];
  const staleIds = sessions
    .filter((session) => session.expiresAt <= now)
    .map((session) => session.id);

  for (const id of staleIds) {
    await deleteNativeTransferSession(id);
  }

  return staleIds;
}
