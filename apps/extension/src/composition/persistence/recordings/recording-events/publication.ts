import { hasHistorySnapshotOwner } from '../history-snapshot-binding';
import { sha256 } from '@noble/hashes/sha2.js';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { applyRecordingEventFact } from './facts';
import { admitStoredRecordingEventsBlock, recordingEventsHex } from './guards';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import { RECORDING_EVENTS_STORE as STORE } from '../../infrastructure/indexed-db/core.stores';
import { isRecordingEventsHead, isRecordingEventsIdentity } from './guards';
import {
  RECORDING_EVENTS_SNAPSHOT_ROLE,
  RecordingEventsError,
  type RecordingEventsWriter,
} from './contracts';

/** The caller commits the file owner, source metadata and this head link together. */
export async function linkRecordingEventsSnapshotInTransaction(
  tx: IndexedDbWriteTransaction,
  writer: RecordingEventsWriter,
  assetId: string
): Promise<void> {
  if (!isRecordingEventsIdentity(writer)) throw new RecordingEventsError('invalid');
  const rows = tx.objectStore(STORE);
  const key = [writer.recordingId, writer.eventStreamId, 'head', 0];
  const head: unknown = await rows.get(key);
  if (
    !isRecordingEventsHead(head) ||
    head.recordingId !== writer.recordingId ||
    head.eventStreamId !== writer.eventStreamId
  )
    throw new RecordingEventsError('integrity');
  if (head.retired || head.writerGeneration !== writer.writerGeneration)
    throw new RecordingEventsError('stale-writer');
  if (!head.finalized || head.totalBlocks === 0 || head.stagingJournalId !== undefined)
    throw new RecordingEventsError('invalid');
  if (
    !(await hasHistorySnapshotOwner(
      tx,
      writer.recordingId,
      RECORDING_EVENTS_SNAPSHOT_ROLE,
      assetId,
      head
    ))
  )
    throw new RecordingEventsError('integrity');
  if (head.snapshotAssetId === assetId) return;
  const next = { ...head, snapshotAssetId: assetId, revision: head.revision + 1 };
  if (!isRecordingEventsHead(next)) throw new RecordingEventsError('invalid');
  await rows.put(next);
}

/** Publishes the private stream and its rebuilt index in the parent root transaction. */
export async function publishStagedRecordingEventsInTransaction(args: {
  tx: IndexedDbWriteTransaction;
  stagingWriter: RecordingEventsWriter;
  recordingId: string;
  descriptor: unknown;
  mintGeneration(): string;
}): Promise<RecordingEventsWriter> {
  const writer = structuredClone(args.stagingWriter);
  const descriptor = structuredClone(args.descriptor);
  const target = { recordingId: args.recordingId, eventStreamId: writer.eventStreamId };
  if (
    !isRecordingEventsIdentity(writer) ||
    !isRecordingEventsIdentity(target) ||
    !isRecordingEventsDescriptor(descriptor) ||
    !descriptor.finalized ||
    descriptor.eventStreamId !== writer.eventStreamId ||
    writer.recordingId === target.recordingId
  )
    throw new RecordingEventsError('invalid');
  const rows = args.tx.objectStore(STORE);
  const sourceKey = [writer.recordingId, writer.eventStreamId];
  const targetKey = [target.recordingId, target.eventStreamId];
  const source: unknown = await rows.get([...sourceKey, 'head', 0]);
  if (
    !isRecordingEventsHead(source) ||
    source.recordingId !== writer.recordingId ||
    source.eventStreamId !== writer.eventStreamId
  )
    throw new RecordingEventsError('integrity');
  if (source.retired) throw new RecordingEventsError('retired');
  if (source.writerGeneration !== writer.writerGeneration)
    throw new RecordingEventsError('stale-writer');
  const totals = ['totalBlocks', 'totalRecords', 'totalBytes', 'streamSha256'] as const;
  if (
    !source.finalized ||
    source.stagingJournalId === undefined ||
    source.state !== descriptor.state ||
    !totals.every((key) => source[key] === descriptor[key])
  )
    throw new RecordingEventsError('conflict');
  const previous: unknown = await rows.get([...targetKey, 'head', 0]);
  if (
    previous !== undefined &&
    (!isRecordingEventsHead(previous) ||
      previous.recordingId !== target.recordingId ||
      previous.eventStreamId !== target.eventStreamId)
  )
    throw new RecordingEventsError('integrity');
  if (isRecordingEventsHead(previous) && !previous.retired)
    throw new RecordingEventsError('conflict');
  const old = isRecordingEventsHead(previous) ? previous : null;
  const generation = args.mintGeneration();
  const { stagingJournalId: _journal, ...publishedSource } = source;
  const next = {
    ...publishedSource,
    ...target,
    writerGeneration: generation,
    revision: (old?.revision ?? 0) + 1,
  };
  if (
    !isRecordingEventsHead(next) ||
    generation === source.writerGeneration ||
    generation === old?.writerGeneration ||
    !isTrajectoryInteger(source.revision + 1)
  )
    throw new RecordingEventsError('invalid');
  const historyRange = (key: string[]) =>
    IDBKeyRange.bound([...key, 'block'], [...key, 'head'], false, true);
  if (await rows.count(historyRange(targetKey))) throw new RecordingEventsError('integrity');
  const digest = sha256.create();
  let totalBlocks = 0,
    totalRecords = 0,
    totalBytes = 0;
  let activeSegment: number | null = null,
    lastSegmentId: number | null = null;
  let hasGap = false,
    activeInputs = 0;
  let cursor = await rows.openCursor(
    IDBKeyRange.bound([...sourceKey, 'block', 0], [...sourceKey, 'block', Number.MAX_SAFE_INTEGER])
  );
  while (cursor) {
    const { row, block } = admitStoredRecordingEventsBlock(cursor.value, source);
    if (row.entryId !== totalBlocks) throw new RecordingEventsError('integrity');
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, row.bytes.byteLength, true);
    digest.update(prefix).update(row.bytes);
    if (recordingEventsHex(digest.clone().digest()) !== row.entry.prefixSha256)
      throw new RecordingEventsError('integrity');
    for (const record of block.records) {
      if (record.recordSeq !== totalRecords) throw new RecordingEventsError('integrity');
      if (record.kind === 'segment') {
        if (
          activeSegment !== null ||
          (lastSegmentId === null ? record.segmentId !== 0 : record.segmentId <= lastSegmentId)
        )
          throw new RecordingEventsError('integrity');
        activeSegment = record.segmentId;
        lastSegmentId = record.segmentId;
      } else if (activeSegment === null || activeSegment !== record.segmentId)
        throw new RecordingEventsError('integrity');
      activeInputs += await applyRecordingEventFact(rows, target, record);
      if (!isTrajectoryInteger(activeInputs)) throw new RecordingEventsError('integrity');
      if (record.kind === 'gap') hasGap = true;
      if (record.kind === 'gap' || record.kind === 'boundary') activeSegment = null;
      totalRecords++;
    }
    totalBlocks++;
    totalBytes += row.bytes.byteLength;
    if (![totalBlocks, totalRecords, totalBytes].every(isTrajectoryInteger))
      throw new RecordingEventsError('integrity');
    await rows.add({ ...row, recordingId: target.recordingId });
    cursor = await cursor.continue();
  }
  const actual = {
    totalBlocks,
    totalRecords,
    totalBytes,
    streamSha256: recordingEventsHex(digest.digest()),
  };
  if (
    !totals.every((key) => actual[key] === descriptor[key]) ||
    activeSegment !== source.activeSegment ||
    lastSegmentId !== source.lastSegmentId ||
    hasGap !== source.hasGap ||
    activeInputs !== source.activeInputs ||
    (descriptor.state === 'complete' && (activeSegment !== null || hasGap || activeInputs !== 0))
  )
    throw new RecordingEventsError('integrity');
  await rows.put(next);
  await rows.put({ ...source, retired: true, revision: source.revision + 1 });
  await rows.delete(historyRange(sourceKey));
  return { ...target, writerGeneration: generation };
}
