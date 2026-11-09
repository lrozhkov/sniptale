import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import { RECORDING_EVENTS_STORE as STORE } from '../../infrastructure/indexed-db/core.stores';
import {
  isRecordingEventsHead,
  isRecordingEventsRootFence,
  recordingEventsRootFenceKey,
  recordingEventsIdentifier,
  isRecordingEventsIdentity,
  RECORDING_EVENTS_EMPTY_SHA256,
} from './guards';
import { RecordingEventsError, type RecordingEventsIdentity } from './contracts';

/** The root owner commits retirement with metadata deletion in the same transaction. */
export async function retireRecordingEventsInTransaction(
  tx: IndexedDbWriteTransaction,
  identity: RecordingEventsIdentity,
  mintGeneration: () => string,
  expectedGeneration?: string
): Promise<void> {
  if (!isRecordingEventsIdentity(identity)) throw new RecordingEventsError('invalid');
  const rows = tx.objectStore(STORE);
  const key = [identity.recordingId, identity.eventStreamId];
  const raw: unknown = await rows.get([...key, 'head', 0]);
  if (
    raw !== undefined &&
    (!isRecordingEventsHead(raw) ||
      raw.recordingId !== identity.recordingId ||
      raw.eventStreamId !== identity.eventStreamId)
  )
    throw new RecordingEventsError('integrity');
  if (
    expectedGeneration !== undefined &&
    (!isRecordingEventsHead(raw) || raw.writerGeneration !== expectedGeneration)
  )
    throw new RecordingEventsError('stale-writer');
  if (isRecordingEventsHead(raw)) {
    if (!raw.retired) {
      const next = { ...raw, retired: true, revision: raw.revision + 1 };
      if (!isRecordingEventsHead(next)) throw new RecordingEventsError('invalid');
      await rows.put(next);
    }
  } else {
    const tombstone = {
      ...identity,
      kind: 'head',
      entryId: 0,
      sourceRecordingId: identity.recordingId,
      writerGeneration: mintGeneration(),
      revision: 2,
      retired: true,
      finalized: false,
      state: 'incomplete',
      totalBlocks: 0,
      totalRecords: 0,
      totalBytes: 0,
      streamSha256: RECORDING_EVENTS_EMPTY_SHA256,
      activeSegment: null,
      lastSegmentId: null,
      hasGap: false,
      activeInputs: 0,
    };
    if (!isRecordingEventsHead(tombstone)) throw new RecordingEventsError('invalid');
    await rows.put(tombstone);
  }
  await rows.delete(IDBKeyRange.bound([...key, 'block'], [...key, 'head'], false, true));
}

/** Reads only compact head rows; raw history stays outside the maintenance scan. */
export async function retireRecordingEventSourcesInTransaction(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  knownEventStreamId?: string
): Promise<void> {
  if (recordingEventsIdentifier(recordingId)) {
    const rows = tx.objectStore(STORE);
    const previous: unknown = await rows.get(recordingEventsRootFenceKey(recordingId));
    if (previous !== undefined && !isRecordingEventsRootFence(previous, recordingId))
      throw new RecordingEventsError('integrity');
    if (previous === undefined)
      await rows.put({
        recordingId,
        eventStreamId: '0'.repeat(32),
        kind: 'root-fence',
        entryId: 0,
      });
  }
  let foundKnown = false;
  let cursor = await tx.objectStore(STORE).index('kind').openCursor('head');
  while (cursor) {
    const raw: unknown = cursor.value;
    if (isPlainRecord(raw) && raw['recordingId'] === recordingId) {
      if (!isRecordingEventsHead(raw)) throw new RecordingEventsError('integrity');
      foundKnown ||= raw.eventStreamId === knownEventStreamId;
      await retireRecordingEventsInTransaction(
        tx,
        { recordingId, eventStreamId: raw.eventStreamId },
        () => crypto.randomUUID()
      );
    }
    cursor = await cursor.continue();
  }
  if (knownEventStreamId && !foundKnown)
    await retireRecordingEventsInTransaction(
      tx,
      { recordingId, eventStreamId: knownEventStreamId },
      () => crypto.randomUUID()
    );
}
