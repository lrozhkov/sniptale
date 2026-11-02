import { hasHistorySnapshotOwner } from '../history-snapshot-binding';
import { verifyCursorTrajectoryPrefix } from './guards';
import { RECORDING_CURSOR_SNAPSHOT_ROLE } from './contracts';
import { sha256 } from '@noble/hashes/sha2.js';
import { encodeCursorTrajectoryRecord } from '../../../../features/video/project/cursor-trajectory/blocks';
import {
  isCursorTrajectoryDescriptor,
  isTrajectoryInteger,
} from '../../../../features/video/project/cursor-trajectory/records';
import type { CursorTrajectorySegment } from '../../../../features/video/project/cursor-trajectory/types';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core.stores';
import {
  admitStoredCursorTrajectoryBlock,
  isCursorTrajectoryHead,
  isCursorTrajectoryIdentity,
} from './guards';
import { RecordingCursorTrajectoryError, type RecordingCursorTrajectoryWriter } from './contracts';

const totals = [
  'totalBlocks',
  'totalRecords',
  'totalSamples',
  'totalBytes',
  'streamSha256',
] as const;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const segmentKey = (segment: CursorTrajectorySegment | null) =>
  segment ? encodeCursorTrajectoryRecord(segment) : 'null';

/** Copies one block at a time. The root owner must commit before it issues a receipt. */
export async function publishStagedCursorTrajectoryInTransaction(args: {
  tx: IndexedDbWriteTransaction;
  stagingWriter: RecordingCursorTrajectoryWriter;
  recordingId: string;
  descriptor: unknown;
  mintGeneration(): string;
}): Promise<RecordingCursorTrajectoryWriter> {
  const writer = structuredClone(args.stagingWriter);
  const descriptor = structuredClone(args.descriptor);
  const target = { recordingId: args.recordingId, trajectoryId: writer.trajectoryId };
  if (
    !isCursorTrajectoryIdentity(writer) ||
    !isCursorTrajectoryIdentity(target) ||
    !isCursorTrajectoryDescriptor(descriptor) ||
    !descriptor.finalized ||
    descriptor.trajectoryId !== writer.trajectoryId ||
    writer.recordingId === target.recordingId
  )
    throw new RecordingCursorTrajectoryError('invalid');
  const heads = args.tx.objectStore(HEADS);
  const blocks = args.tx.objectStore(BLOCKS);
  const sourceKey = [writer.recordingId, writer.trajectoryId];
  const targetKey = [target.recordingId, target.trajectoryId];
  const source: unknown = await heads.get(sourceKey);
  if (
    !isCursorTrajectoryHead(source) ||
    source.recordingId !== writer.recordingId ||
    source.trajectoryId !== writer.trajectoryId
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (source.retired) throw new RecordingCursorTrajectoryError('retired');
  if (source.writerGeneration !== writer.writerGeneration)
    throw new RecordingCursorTrajectoryError('stale-writer');
  if (
    !source.finalized ||
    source.state !== descriptor.state ||
    !totals.every((key) => source[key] === descriptor[key])
  )
    throw new RecordingCursorTrajectoryError('conflict');
  const previous: unknown = await heads.get(targetKey);
  if (
    previous !== undefined &&
    (!isCursorTrajectoryHead(previous) ||
      previous.recordingId !== target.recordingId ||
      previous.trajectoryId !== target.trajectoryId)
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (isCursorTrajectoryHead(previous) && !previous.retired)
    throw new RecordingCursorTrajectoryError('conflict');
  const generation = args.mintGeneration();
  const old = isCursorTrajectoryHead(previous) ? previous : null;
  const { stagingJournalId: _stagingJournalId, ...publishedSource } = source;
  const next = {
    ...publishedSource,
    ...target,
    writerGeneration: generation,
    revision: (old?.revision ?? 0) + 1,
  };
  if (
    !isCursorTrajectoryHead(next) ||
    generation === source.writerGeneration ||
    generation === old?.writerGeneration ||
    !isTrajectoryInteger(source.revision + 1)
  )
    throw new RecordingCursorTrajectoryError('invalid');
  const range = (key: string[]) =>
    IDBKeyRange.bound([...key, 0], [...key, Number.MAX_SAFE_INTEGER]);
  if (await blocks.count(range(targetKey))) throw new RecordingCursorTrajectoryError('integrity');
  const digest = sha256.create();
  const actual = {
    totalBlocks: 0,
    totalRecords: 0,
    totalSamples: 0,
    totalBytes: 0,
    streamSha256: hex(sha256(new Uint8Array())),
  };
  let segment: CursorTrajectorySegment | null = null;
  let hasGap = false;
  let cursor = await blocks.openCursor(range(sourceKey));
  while (cursor) {
    const { row, block } = admitStoredCursorTrajectoryBlock(cursor.value, source);
    if (
      row.sequence !== actual.totalBlocks ||
      segmentKey(row.initialSegment) !== segmentKey(segment)
    )
      throw new RecordingCursorTrajectoryError('integrity');
    verifyCursorTrajectoryPrefix(digest, row);
    for (const record of block.records) {
      if (record.kind === 'segment') {
        if (record.width !== source.width || record.height !== source.height)
          throw new RecordingCursorTrajectoryError('integrity');
        segment = record;
      }
      if (record.kind === 'gap') hasGap = true;
      if (record.kind === 'gap' || record.kind === 'boundary') segment = null;
    }
    actual.totalBlocks++;
    actual.totalRecords += row.entry.recordCount;
    actual.totalSamples += row.entry.sampleCount;
    actual.totalBytes += row.bytes.byteLength;
    if (
      ![actual.totalBlocks, actual.totalRecords, actual.totalSamples, actual.totalBytes].every(
        isTrajectoryInteger
      )
    )
      throw new RecordingCursorTrajectoryError('integrity');
    await blocks.add({ ...row, recordingId: target.recordingId });
    cursor = await cursor.continue();
  }
  actual.streamSha256 = hex(digest.digest());
  if (
    !totals.every((key) => actual[key] === descriptor[key]) ||
    (descriptor.state === 'complete' && (segment !== null || hasGap))
  )
    throw new RecordingCursorTrajectoryError('integrity');
  await heads.put(next);
  await heads.put({ ...source, retired: true, revision: source.revision + 1 });
  await blocks.delete(range(sourceKey));
  return { ...target, writerGeneration: generation };
}

/** Links the verified native file in the same transaction as its owner and source metadata. */
export async function linkCursorTrajectorySnapshotInTransaction(
  tx: IndexedDbWriteTransaction,
  writer: RecordingCursorTrajectoryWriter,
  assetId: string
): Promise<void> {
  if (!isCursorTrajectoryIdentity(writer)) throw new RecordingCursorTrajectoryError('invalid');
  const heads = tx.objectStore(HEADS);
  const key = [writer.recordingId, writer.trajectoryId];
  const head: unknown = await heads.get(key);
  if (
    !isCursorTrajectoryHead(head) ||
    head.recordingId !== writer.recordingId ||
    head.trajectoryId !== writer.trajectoryId
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (head.retired || head.writerGeneration !== writer.writerGeneration)
    throw new RecordingCursorTrajectoryError('stale-writer');
  if (!head.finalized || head.totalBlocks === 0 || head.stagingJournalId !== undefined)
    throw new RecordingCursorTrajectoryError('invalid');
  if (
    !(await hasHistorySnapshotOwner(
      tx,
      writer.recordingId,
      RECORDING_CURSOR_SNAPSHOT_ROLE,
      assetId,
      head
    ))
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (head.snapshotAssetId === assetId) return;
  const next = { ...head, snapshotAssetId: assetId, revision: head.revision + 1 };
  if (!isCursorTrajectoryHead(next)) throw new RecordingCursorTrajectoryError('invalid');
  await heads.put(next);
}
