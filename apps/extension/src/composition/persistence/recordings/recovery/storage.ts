import { createStrictRecordingTransaction } from './transaction';
// policyStateId: persistent-data-erasure-lease
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  initDB,
  RECORDING_RECOVERY_SESSIONS_STORE as SESSIONS,
  RECORDING_RECOVERY_BLOCKS_STORE as BLOCKS,
  type IndexedDbWriteTransaction,
} from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';

export const RECORDING_RECOVERY_BLOCK_BYTES = 4 * 1024 * 1024;
const EPOCH_ID = '@epoch';

/** Durable source identity and the separate id reserved for recovered publication. */
export interface RecoveryRecording {
  id: string;
  recoveryId: string;
  incarnation: string;
  epoch: string;
  filename: string;
  mimeType: string;
  createdAt: number;
  size: number;
  blockCount: number;
  complete: boolean;
  published: boolean;
  groupId?: string;
  role?: string;
}

export function parseRecoveryRecording(raw: unknown): RecoveryRecording | null {
  if (!isRecord(raw)) return null;
  const {
    id,
    recoveryId,
    incarnation,
    epoch,
    filename,
    mimeType,
    createdAt,
    size,
    blockCount,
    complete,
    published,
    groupId,
    role,
  } = raw;
  if (
    typeof id !== 'string' ||
    !id ||
    id === EPOCH_ID ||
    typeof recoveryId !== 'string' ||
    !recoveryId ||
    recoveryId === id ||
    typeof incarnation !== 'string' ||
    !incarnation ||
    typeof epoch !== 'string' ||
    !epoch ||
    typeof filename !== 'string' ||
    !filename ||
    typeof mimeType !== 'string' ||
    !mimeType ||
    typeof createdAt !== 'number' ||
    !Number.isFinite(createdAt) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    typeof blockCount !== 'number' ||
    !Number.isSafeInteger(blockCount) ||
    blockCount < 0 ||
    typeof complete !== 'boolean' ||
    (published !== undefined && typeof published !== 'boolean') ||
    (groupId !== undefined && typeof groupId !== 'string') ||
    (role !== undefined && typeof role !== 'string')
  )
    return null;
  return {
    id,
    recoveryId,
    incarnation,
    epoch,
    filename,
    mimeType,
    createdAt,
    size,
    blockCount,
    complete,
    published: published === true,
    ...(groupId === undefined ? {} : { groupId }),
    ...(role === undefined ? {} : { role }),
  };
}

function epochToken(raw: unknown): string | null {
  return isRecord(raw) && raw['id'] === EPOCH_ID && typeof raw['token'] === 'string'
    ? raw['token']
    : null;
}

/** Only opening initializes epochs. A delayed append must never revive erased data. */
export async function initializeRecoveryEpoch(): Promise<string> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = createStrictRecordingTransaction(db, SESSIONS);
    const raw: unknown = await tx.objectStore(SESSIONS).get(EPOCH_ID);
    const token = epochToken(raw) ?? crypto.randomUUID();
    if (raw === undefined) await tx.objectStore(SESSIONS).add({ id: EPOCH_ID, token });
    else if (!epochToken(raw)) throw new Error('Recording recovery epoch is invalid.');
    await tx.done;
    return token;
  });
}

export function recoveryLockName(id: string): string {
  return `sniptale:recording-recovery:${id}`;
}

export async function acquireRecoveryLock(
  id: string,
  ifAvailable = false
): Promise<() => Promise<void>> {
  if (!navigator.locks) throw new Error('Recording recovery requires Web Locks.');
  let unlock!: () => void;
  let acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const operation = navigator.locks.request(recoveryLockName(id), { ifAvailable }, async (lock) => {
    if (!lock) throw new Error('Recording recovery source is active.');
    acquired();
    await held;
  });
  await Promise.race([ready, operation]);
  return async () => {
    unlock();
    await operation;
  };
}

export async function assertRecoveryIdentity(entry: RecoveryRecording): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(SESSIONS);
  const current = parseRecoveryRecording(await tx.objectStore(SESSIONS).get(entry.id));
  const epoch = epochToken(await tx.objectStore(SESSIONS).get(EPOCH_ID));
  await tx.done;
  if (
    !current ||
    current.incarnation !== entry.incarnation ||
    epoch !== entry.epoch ||
    current.epoch !== entry.epoch
  )
    throw new Error('Recording recovery identity is stale.');
}

export async function openRecoverySession(
  input: {
    artifactId: string;
    filename: string;
    mimeType: string;
    groupId?: string;
    role?: string;
  },
  epoch: string
): Promise<RecoveryRecording> {
  const entry: RecoveryRecording = {
    id: input.artifactId,
    recoveryId: crypto.randomUUID(),
    incarnation: crypto.randomUUID(),
    epoch,
    filename: input.filename,
    mimeType: input.mimeType,
    createdAt: Date.now(),
    size: 0,
    blockCount: 0,
    complete: false,
    published: false,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    ...(input.role === undefined ? {} : { role: input.role }),
  };
  await runWithIndexedDbMutation(async (db) => {
    const tx = createStrictRecordingTransaction(db, SESSIONS);
    try {
      if (epochToken(await tx.objectStore(SESSIONS).get(EPOCH_ID)) !== epoch)
        throw new Error('Recording recovery epoch is stale.');
      await tx.objectStore(SESSIONS).add(entry);
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
  return entry;
}

export async function commitRecoveryBlock(
  entry: RecoveryRecording,
  bytes: ArrayBuffer
): Promise<void> {
  if (bytes.byteLength === 0 || bytes.byteLength > RECORDING_RECOVERY_BLOCK_BYTES)
    throw new Error('Invalid recording recovery block size.');
  await runWithIndexedDbMutation(async (db) => {
    const tx = createStrictRecordingTransaction(db, [SESSIONS, BLOCKS]);
    try {
      const sessions = tx.objectStore(SESSIONS);
      const current = parseRecoveryRecording(await sessions.get(entry.id));
      if (
        !current ||
        current.incarnation !== entry.incarnation ||
        current.epoch !== entry.epoch ||
        epochToken(await sessions.get(EPOCH_ID)) !== entry.epoch ||
        current.blockCount !== entry.blockCount ||
        current.complete
      )
        throw new Error('Recording recovery writer is stale.');
      await tx
        .objectStore(BLOCKS)
        .add({ id: entry.id, index: entry.blockCount, incarnation: entry.incarnation, bytes });
      await sessions.put({
        ...current,
        blockCount: current.blockCount + 1,
        size: current.size + bytes.byteLength,
      });
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
  entry.blockCount += 1;
  entry.size += bytes.byteLength;
}

export async function completeRecoverySession(entry: RecoveryRecording): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = createStrictRecordingTransaction(db, SESSIONS);
    try {
      const current = parseRecoveryRecording(await tx.objectStore(SESSIONS).get(entry.id));
      if (
        !current ||
        current.incarnation !== entry.incarnation ||
        current.epoch !== entry.epoch ||
        epochToken(await tx.objectStore(SESSIONS).get(EPOCH_ID)) !== entry.epoch
      )
        throw new Error('Recording recovery identity is stale.');
      await tx.objectStore(SESSIONS).put({ ...current, complete: true });
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
  entry.complete = true;
}

/** Participate in an admitted canonical deletion. Refused deletion must not call this. */
export async function deleteRecoveryInTransaction(
  tx: IndexedDbWriteTransaction,
  id: string
): Promise<void> {
  if (id === EPOCH_ID) return;
  const sources: unknown[] = await tx.objectStore(SESSIONS).getAll();
  const ids = new Set([id]);
  for (const raw of sources) {
    const entry = parseRecoveryRecording(raw);
    if (entry?.recoveryId === id) ids.add(entry.id);
  }
  const store = tx.objectStore(BLOCKS);
  for (const sourceId of ids) {
    const keys = await store.index('id').getAllKeys(sourceId);
    for (const key of keys) await store.delete(key);
    await tx.objectStore(SESSIONS).delete(sourceId);
  }
}

export async function readRecoveryHeader(id: string): Promise<RecoveryRecording> {
  const db = await initDB();
  const entry = parseRecoveryRecording(await db.get(SESSIONS, id));
  if (!entry) throw new Error('Recording recovery source is unavailable.');
  return entry;
}

/** Each pull reads one bounded block and rechecks the durable generation. */
export function streamRecoveryRecording(entry: RecoveryRecording): ReadableStream<Uint8Array> {
  let index = 0;
  let size = 0;
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          await assertRecoveryIdentity(entry);
          if (index >= entry.blockCount) {
            if (size !== entry.size) throw new Error('Recording recovery size is invalid.');
            controller.close();
            return;
          }
          const db = await initDB();
          const raw: unknown = await db.get(BLOCKS, [entry.id, index]);
          if (
            !isRecord(raw) ||
            raw['id'] !== entry.id ||
            raw['index'] !== index ||
            raw['incarnation'] !== entry.incarnation ||
            !(raw['bytes'] instanceof ArrayBuffer) ||
            raw['bytes'].byteLength > RECORDING_RECOVERY_BLOCK_BYTES
          )
            throw new Error('Recording recovery block is unavailable.');
          size += raw['bytes'].byteLength;
          controller.enqueue(new Uint8Array(raw['bytes']));
          index += 1;
        } catch (error) {
          controller.error(error);
        }
      },
    },
    { highWaterMark: 0 }
  );
}
