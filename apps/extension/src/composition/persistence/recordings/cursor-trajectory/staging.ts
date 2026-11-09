import { sha256 } from '@noble/hashes/sha2.js';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import {
  RecordingCursorTrajectoryError,
  type RecordingCursorTrajectoryIdentity,
} from './contracts';
import { isCursorTrajectoryHead, isCursorTrajectoryIdentity } from './guards';
import { retireCursorTrajectoryInTransaction } from './retirement';

const hash = (value: string): string =>
  Array.from(sha256(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
function prefix(journalId: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(journalId))
    throw new RecordingCursorTrajectoryError('invalid');
  return `cursor-stage:${hash(journalId).slice(0, 32)}:`;
}

/** Journal and portable identity select a stable private namespace for retries and recovery. */
export function cursorTrajectoryStagingIdentity(
  journalId: string,
  source: RecordingCursorTrajectoryIdentity
): RecordingCursorTrajectoryIdentity {
  if (!isCursorTrajectoryIdentity(source)) throw new RecordingCursorTrajectoryError('invalid');
  return {
    recordingId: `${prefix(journalId)}${hash(JSON.stringify([source.recordingId, source.trajectoryId])).slice(0, 32)}`,
    trajectoryId: source.trajectoryId,
  };
}

/** The journal owner calls this before dropping its ready claim. A name prefix grants no authority. */
export async function retireJournalCursorTrajectoryStagesInTransaction(
  tx: IndexedDbWriteTransaction,
  journalId: string
): Promise<void> {
  const from = prefix(journalId);
  let cursor = await tx
    .objectStore(HEADS)
    .index('recordingId')
    .openCursor(IDBKeyRange.bound(from, `${from}\uffff`));
  while (cursor) {
    const head: unknown = cursor.value;
    if (!isCursorTrajectoryHead(head)) throw new RecordingCursorTrajectoryError('integrity');
    if (head.stagingJournalId === journalId)
      await retireCursorTrajectoryInTransaction(
        tx,
        head,
        () => crypto.randomUUID(),
        head.writerGeneration
      );
    cursor = await cursor.continue();
  }
}

/** The caller keeps its ready claim and lifecycle lock until cleanup commits. */
export async function retireJournalCursorTrajectoryStages(journalId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
    try {
      await retireJournalCursorTrajectoryStagesInTransaction(tx, journalId);
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
