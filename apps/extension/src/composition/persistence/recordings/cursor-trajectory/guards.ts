import { sha256 } from '@noble/hashes/sha2.js';
import { parseAssetRef } from '../../assets/guards';
import type { RecordingTelemetryEntry } from '../contracts';
import { isCursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/records';
import { decodeCursorTrajectoryBlock } from '../../../../features/video/project/cursor-trajectory/blocks';
import type { CursorTrajectoryBlock } from '../../../../features/video/project/cursor-trajectory/types';
import { RecordingCursorTrajectoryError } from './contracts';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryRecord,
  isTrajectoryInteger,
} from '../../../../features/video/project/cursor-trajectory/records';
import type {
  CursorTrajectoryManifestEntry,
  CursorTrajectorySegment,
} from '../../../../features/video/project/cursor-trajectory/types';
import type {
  RecordingCursorTrajectoryHead,
  RecordingCursorTrajectoryIdentity,
  RecordingCursorTrajectoryTotals,
  StoredRecordingCursorBlock,
} from './contracts';

export function isCursorTrajectoryIdentity(
  value: unknown
): value is RecordingCursorTrajectoryIdentity {
  return (
    isPlainRecord(value) &&
    typeof value['recordingId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['recordingId']) &&
    typeof value['trajectoryId'] === 'string' &&
    /^[a-f0-9]{32}$/.test(value['trajectoryId'])
  );
}

/** A native snapshot ref must identify exactly the immutable framed source. */
export function isRecordingCursorTrajectorySnapshot(
  value: unknown,
  descriptor: unknown
): value is NonNullable<RecordingTelemetryEntry['cursorTrajectorySnapshot']> {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 4 ||
    !isCursorTrajectoryDescriptor(descriptor) ||
    !descriptor.finalized ||
    descriptor.totalBlocks === 0
  )
    return false;
  const ref = parseAssetRef(value['ref']);
  return (
    ref !== null &&
    ref.mimeType === 'application/octet-stream' &&
    ref.sha256 === descriptor.streamSha256 &&
    ref.size === descriptor.totalBytes + descriptor.totalBlocks * 4 &&
    typeof value['sourceRecordingId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['sourceRecordingId']) &&
    [value['width'], value['height']].every(
      (size) => isTrajectoryInteger(size) && size > 0 && size <= 0xffffffff
    )
  );
}

export function isCursorTrajectoryTotals(value: unknown): value is RecordingCursorTrajectoryTotals {
  return (
    isPlainRecord(value) &&
    ['totalBlocks', 'totalRecords', 'totalSamples', 'totalBytes'].every((key) =>
      isTrajectoryInteger(value[key])
    ) &&
    typeof value['streamSha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(value['streamSha256'])
  );
}

export function isCursorTrajectoryEntry(value: unknown): value is CursorTrajectoryManifestEntry {
  if (!isPlainRecord(value) || Object.keys(value).length !== 8) return false;
  const { sequence, startTimeUs, endTimeUs, recordCount, sampleCount, byteLength } = value;
  return (
    isTrajectoryInteger(sequence) &&
    isTrajectoryInteger(startTimeUs) &&
    isTrajectoryInteger(endTimeUs) &&
    isTrajectoryInteger(recordCount) &&
    recordCount > 0 &&
    recordCount <= 512 &&
    isTrajectoryInteger(sampleCount) &&
    sampleCount <= recordCount &&
    isTrajectoryInteger(byteLength) &&
    byteLength > 0 &&
    byteLength <= 65536 &&
    endTimeUs >= startTimeUs &&
    ['blockSha256', 'prefixSha256'].every(
      (key) => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key])
    )
  );
}

function isStoredCursorSegment(value: unknown): value is CursorTrajectorySegment | null {
  return value === null || (isCursorTrajectoryRecord(value) && value.kind === 'segment');
}

export function isCursorTrajectoryHead(value: unknown): value is RecordingCursorTrajectoryHead {
  if (
    !isCursorTrajectoryIdentity(value) ||
    !isCursorTrajectoryTotals(value) ||
    !isPlainRecord(value) ||
    Object.keys(value).length !==
      19 +
        Number(Object.hasOwn(value, 'stagingJournalId')) +
        Number(Object.hasOwn(value, 'snapshotAssetId'))
  )
    return false;
  const { width, height, state } = value;
  return (
    (!Object.hasOwn(value, 'snapshotAssetId') ||
      (typeof value['snapshotAssetId'] === 'string' &&
        value['snapshotAssetId'].length > 0 &&
        value['finalized'] === true &&
        !Object.hasOwn(value, 'stagingJournalId'))) &&
    (!Object.hasOwn(value, 'stagingJournalId') ||
      (typeof value['stagingJournalId'] === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(value['stagingJournalId']))) &&
    typeof value['sourceRecordingId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['sourceRecordingId']) &&
    typeof value['writerGeneration'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['writerGeneration']) &&
    ['revision', 'lastTimeUs'].every((key) => isTrajectoryInteger(value[key])) &&
    isTrajectoryInteger(width) &&
    width <= 0xffffffff &&
    isTrajectoryInteger(height) &&
    height <= 0xffffffff &&
    ((width > 0 && height > 0) || (value['retired'] === true && width === 0 && height === 0)) &&
    typeof value['retired'] === 'boolean' &&
    typeof value['finalized'] === 'boolean' &&
    typeof state === 'string' &&
    ['complete', 'incomplete', 'unavailable'].includes(state) &&
    isStoredCursorSegment(value['activeSegment']) &&
    (value['lastObservationSeq'] === null || isTrajectoryInteger(value['lastObservationSeq'])) &&
    (value['lastSegmentId'] === null || isTrajectoryInteger(value['lastSegmentId']))
  );
}

function isStoredRecordingCursorBlock(value: unknown): value is StoredRecordingCursorBlock {
  if (
    !isCursorTrajectoryIdentity(value) ||
    !isPlainRecord(value) ||
    Object.keys(value).length !== 7
  )
    return false;
  return (
    isTrajectoryInteger(value['sequence']) &&
    isTrajectoryInteger(value['startTimeUs']) &&
    isCursorTrajectoryEntry(value['entry']) &&
    value['entry'].sequence === value['sequence'] &&
    value['entry'].startTimeUs === value['startTimeUs'] &&
    isStoredCursorSegment(value['initialSegment']) &&
    value['bytes'] instanceof Uint8Array &&
    value['bytes'].byteLength === value['entry'].byteLength
  );
}

/** Validates original stored bytes and the context that the stream owner supplied. */
export function admitStoredCursorTrajectoryBlock(
  raw: unknown,
  head: RecordingCursorTrajectoryHead
): { row: StoredRecordingCursorBlock; block: CursorTrajectoryBlock } {
  if (
    !isStoredRecordingCursorBlock(raw) ||
    raw.recordingId !== head.recordingId ||
    raw.trajectoryId !== head.trajectoryId ||
    Array.from(sha256(raw.bytes), (byte) => byte.toString(16).padStart(2, '0')).join('') !==
      raw.entry.blockSha256
  )
    throw new RecordingCursorTrajectoryError('integrity');
  if (
    raw.initialSegment &&
    (raw.initialSegment.width !== head.width || raw.initialSegment.height !== head.height)
  )
    throw new RecordingCursorTrajectoryError('integrity');
  const block = decodeCursorTrajectoryBlock(raw.bytes, raw.initialSegment);
  if (
    !block ||
    block.sequence !== raw.sequence ||
    block.recordingId !== head.sourceRecordingId ||
    block.trajectoryId !== head.trajectoryId ||
    block.startTimeUs !== raw.entry.startTimeUs ||
    block.endTimeUs !== raw.entry.endTimeUs ||
    block.records.length !== raw.entry.recordCount ||
    block.records.filter((record) => record.kind === 'sample').length !== raw.entry.sampleCount
  )
    throw new RecordingCursorTrajectoryError('integrity');
  return { row: raw, block };
}
