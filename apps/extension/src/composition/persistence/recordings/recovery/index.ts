import { createStrictRecordingTransaction } from './transaction';
import {
  assertRecoveryIdentity,
  acquireRecoveryLock,
  recoveryLockName,
  parseRecoveryRecording,
  readRecoveryHeader,
  deleteRecoveryInTransaction,
  streamRecoveryRecording,
  type RecoveryRecording,
} from './storage';
import {
  initDB,
  RECORDING_RECOVERY_SESSIONS_STORE as SESSIONS,
  RECORDING_RECOVERY_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import type { PersistenceMutationTransitionPermit } from '../../infrastructure/mutation-barrier';
import { createAssetObjectWriter, readAssetFile, discardPreparedAsset } from '../../assets';
export { streamRecoveryRecording, type RecoveryRecording } from './storage';

/** Discover interrupted sessions and saved copies without blocking live recording. */
export async function listRecoverableRecordings(): Promise<RecoveryRecording[]> {
  if (!navigator.locks) throw new Error('Recording recovery requires Web Locks.');
  const db = await initDB();
  const rows: unknown[] = await db.getAll(SESSIONS);
  const entries: RecoveryRecording[] = [];
  for (const raw of rows) {
    const entry = parseRecoveryRecording(raw);
    if (!entry || entry.size === 0) continue;
    await navigator.locks.request(
      recoveryLockName(entry.id),
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return;
        try {
          await assertRecoveryIdentity(entry);
          entries.push(entry);
        } catch {
          /* Deleted during discovery. */
        }
      }
    );
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/** Hold the source identity across repair, download and publication. */
export async function withRecoveryRecording<T>(
  id: string,
  incarnation: string,
  operation: (entry: RecoveryRecording) => Promise<T>
): Promise<T> {
  await initDB();
  const before = await readRecoveryHeader(id);
  if (before.incarnation !== incarnation) throw new Error('Recording recovery identity is stale.');
  const release = await acquireRecoveryLock(id, true);
  try {
    await assertRecoveryIdentity(before);
    return await operation(await readRecoveryHeader(id));
  } finally {
    await release();
  }
}

/** Produce a disk-backed file with bounded memory. The caller must release it. */
export async function readRecoveryRecording(
  id: string,
  persistenceTransitionPermit?: PersistenceMutationTransitionPermit
): Promise<{ entry: RecoveryRecording; file: File; release(): Promise<void> }> {
  const entry = await readRecoveryHeader(id);
  await assertRecoveryIdentity(entry);
  const writer = await createAssetObjectWriter(
    { mimeType: entry.mimeType },
    persistenceTransitionPermit ? { persistenceTransitionPermit } : {}
  );
  const reader = streamRecoveryRecording(entry).getReader();
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      await writer.append(new Blob([result.value.slice().buffer]));
    }
    const prepared = await writer.finalize();
    return {
      entry,
      file: await readAssetFile(prepared.ref, entry.filename),
      release: () => discardPreparedAsset(prepared.ref.assetId),
    };
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** Explicitly delete the selected incarnation and all of its durable bytes. */
export async function deleteRecoveryRecording(id: string, incarnation: string): Promise<void> {
  await withRecoveryRecording(id, incarnation, async (entry) => {
    await runWithIndexedDbMutation(async (db) => {
      const tx = createStrictRecordingTransaction(db, [SESSIONS, BLOCKS]);
      try {
        const current = parseRecoveryRecording(await tx.objectStore(SESSIONS).get(id));
        if (!current || current.incarnation !== entry.incarnation || current.epoch !== entry.epoch)
          throw new Error('Recording recovery identity is stale.');
        await deleteRecoveryInTransaction(tx, id);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already closed. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
  });
}

export type { RecordingRecoverySource } from './publication';
