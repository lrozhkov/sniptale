import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { canExpireNativeRecordingHistoryParent } from '../../../../composition/persistence/recordings/native-history/guards';
import { abortIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/transaction';
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

/** Expiry and deletion use the current parent in one transaction, without a stale candidate array. */
export async function cleanupStaleNativeTransferSessions(now = Date.now()): Promise<string[]> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [NATIVE_TRANSFER_SESSIONS_STORE, NATIVE_TRANSFER_CHUNKS_STORE],
      'readwrite'
    );
    const deleted: string[] = [];
    try {
      const sessions = tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE);
      const chunks = tx.objectStore(NATIVE_TRANSFER_CHUNKS_STORE);
      for (let cursor = await sessions.openCursor(); cursor; cursor = await cursor.continue()) {
        const raw: unknown = cursor.value;
        if (
          !isPlainRecord(raw) ||
          typeof raw['id'] !== 'string' ||
          typeof raw['expiresAt'] !== 'number' ||
          !Number.isSafeInteger(raw['expiresAt']) ||
          raw['expiresAt'] < 0 ||
          raw['expiresAt'] > now ||
          !canExpireNativeRecordingHistoryParent(raw)
        )
          continue;
        const id = raw['id'];
        await cursor.delete();
        for (
          let chunk = await chunks.index('sessionId').openKeyCursor(id);
          chunk;
          chunk = await chunk.continue()
        )
          await chunks.delete(chunk.primaryKey);
        deleted.push(id);
      }
      await tx.done;
      return deleted;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
