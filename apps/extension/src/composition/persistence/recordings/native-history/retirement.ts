import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_EVENTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { isCursorTrajectoryHead } from '../cursor-trajectory/guards';
import { isRecordingEventsHead } from '../recording-events/guards';
import { retireCursorTrajectoryInTransaction } from '../cursor-trajectory/retirement';
import { retireRecordingEventsInTransaction } from '../recording-events/retirement';
import { isNativeRecordingHistoryIntent, isNativeRecordingHistoryParent } from './guards';
import { NativeRecordingHistoryError } from './contracts';

/** Source deletion closes planned writers before it removes the recording body. */
export async function retireNativeRecordingHistoryInTransaction(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  now = Date.now()
): Promise<void> {
  const parents = tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE);
  const parent: unknown = await parents.get(recordingId);
  if (
    !isPlainRecord(parent) ||
    !isPlainRecord(parent['metadata']) ||
    parent['metadata']['history'] === undefined
  )
    return;
  if (
    !isNativeRecordingHistoryParent(parent) ||
    parent.id !== recordingId ||
    !isNativeRecordingHistoryIntent(parent.metadata.history) ||
    parent.metadata.history.recordingId !== recordingId
  )
    throw new NativeRecordingHistoryError('invalid');
  const intent = parent.metadata.history;
  if (intent.phase === 'cancelled') return;
  const cursor = intent.cursor?.writer;
  if (cursor) {
    const head: unknown = await tx
      .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
      .get([cursor.recordingId, cursor.trajectoryId]);
    if (head !== undefined && !isCursorTrajectoryHead(head))
      throw new NativeRecordingHistoryError('invalid');
    if (head === undefined || head.writerGeneration === cursor.writerGeneration) {
      if (
        head &&
        !head.retired &&
        (head.stagingJournalId !== intent.operationId || head.sourceRecordingId !== recordingId)
      )
        throw new NativeRecordingHistoryError('invalid');
      await retireCursorTrajectoryInTransaction(
        tx,
        cursor,
        () => cursor.writerGeneration,
        head ? cursor.writerGeneration : undefined
      );
    }
  }
  const events = intent.events?.writer;
  if (events) {
    const head: unknown = await tx
      .objectStore(RECORDING_EVENTS_STORE)
      .get([events.recordingId, events.eventStreamId, 'head', 0]);
    if (head !== undefined && !isRecordingEventsHead(head))
      throw new NativeRecordingHistoryError('invalid');
    if (head === undefined || head.writerGeneration === events.writerGeneration) {
      if (
        head &&
        !head.retired &&
        (head.stagingJournalId !== intent.operationId || head.sourceRecordingId !== recordingId)
      )
        throw new NativeRecordingHistoryError('invalid');
      await retireRecordingEventsInTransaction(
        tx,
        events,
        () => events.writerGeneration,
        head ? events.writerGeneration : undefined
      );
    }
  }
  const cancelled = {
    ...intent,
    phase: 'cancelled',
    cursor: intent.cursor ? { ...intent.cursor, pull: null } : null,
    events: intent.events ? { ...intent.events, pull: null } : null,
    revision: intent.revision + 1,
    updatedAt: Math.max(now, intent.updatedAt),
  };
  if (!isNativeRecordingHistoryIntent(cancelled)) throw new NativeRecordingHistoryError('invalid');
  await parents.put({
    ...parent,
    metadata: { ...parent.metadata, history: cancelled },
    updatedAt: Math.max(parent.updatedAt, now),
    expiresAt: now + 24 * 60 * 60 * 1000,
  });
}
