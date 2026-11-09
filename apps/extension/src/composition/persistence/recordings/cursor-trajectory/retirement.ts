import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core.stores';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { isCursorTrajectoryHead, isCursorTrajectoryIdentity } from './guards';
import {
  RecordingCursorTrajectoryError,
  type RecordingCursorTrajectoryIdentity,
  type RecordingCursorTrajectoryHead,
} from './contracts';

const emptyDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** The caller owns transaction commit, rollback and its persistence mutation permit. */
export async function retireCursorTrajectoryInTransaction(
  tx: IndexedDbWriteTransaction,
  identity: RecordingCursorTrajectoryIdentity,
  mintGeneration: () => string,
  expectedGeneration?: string
): Promise<void> {
  if (!isCursorTrajectoryIdentity(identity)) throw new RecordingCursorTrajectoryError('invalid');
  identity = { ...identity };
  const key = [identity.recordingId, identity.trajectoryId];
  const raw: unknown = await tx.objectStore(HEADS).get(key);
  if (
    raw !== undefined &&
    (!isCursorTrajectoryHead(raw) ||
      raw.recordingId !== identity.recordingId ||
      raw.trajectoryId !== identity.trajectoryId)
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (
    expectedGeneration !== undefined &&
    (!isCursorTrajectoryHead(raw) || raw.writerGeneration !== expectedGeneration)
  )
    throw new RecordingCursorTrajectoryError('stale-writer');
  if (isCursorTrajectoryHead(raw)) {
    if (!raw.retired) {
      if (!isTrajectoryInteger(raw.revision + 1))
        throw new RecordingCursorTrajectoryError('invalid');
      await tx.objectStore(HEADS).put({ ...raw, retired: true, revision: raw.revision + 1 });
    }
  } else {
    const tombstone: RecordingCursorTrajectoryHead = {
      ...identity,
      sourceRecordingId: identity.recordingId,
      writerGeneration: mintGeneration(),
      revision: 1,
      width: 0,
      height: 0,
      retired: true,
      finalized: true,
      state: 'unavailable',
      totalBlocks: 0,
      totalRecords: 0,
      totalSamples: 0,
      totalBytes: 0,
      streamSha256: emptyDigest,
      activeSegment: null,
      lastObservationSeq: null,
      lastSegmentId: null,
      lastTimeUs: 0,
    };
    if (!isCursorTrajectoryHead(tombstone)) throw new RecordingCursorTrajectoryError('invalid');
    await tx.objectStore(HEADS).put(tombstone);
  }
  await tx
    .objectStore(BLOCKS)
    .delete(IDBKeyRange.bound([...key, 0], [...key, Number.MAX_SAFE_INTEGER]));
}

/** Retires source-owned histories atomically with deletion, including a not-yet-started known stream. */
export async function retireRecordingCursorTrajectoriesInTransaction(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  knownTrajectoryId?: string
): Promise<void> {
  const heads: unknown = await tx.objectStore(HEADS).index('recordingId').getAll(recordingId);
  if (!Array.isArray(heads)) throw new RecordingCursorTrajectoryError('integrity');
  // Legacy recording identities need no new-format admission when they own no trajectory.
  if (heads.length === 0 && knownTrajectoryId === undefined) return;
  if (
    !isCursorTrajectoryIdentity({ recordingId, trajectoryId: knownTrajectoryId ?? '0'.repeat(32) })
  )
    throw new RecordingCursorTrajectoryError('invalid');
  const known = new Set<string>();
  for (const raw of heads) {
    if (!isCursorTrajectoryHead(raw) || raw.recordingId !== recordingId)
      throw new RecordingCursorTrajectoryError('integrity');
    known.add(raw.trajectoryId);
    await retireCursorTrajectoryInTransaction(
      tx,
      { recordingId, trajectoryId: raw.trajectoryId },
      () => crypto.randomUUID()
    );
  }
  if (knownTrajectoryId && !known.has(knownTrajectoryId))
    await retireCursorTrajectoryInTransaction(
      tx,
      { recordingId, trajectoryId: knownTrajectoryId },
      () => crypto.randomUUID()
    );
}
