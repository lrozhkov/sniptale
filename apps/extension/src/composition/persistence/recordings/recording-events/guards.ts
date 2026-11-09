import { isHistorySnapshotRef } from '../history-snapshot-ref';
import { parseAssetRef } from '../../assets/guards';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import type { RecordingEventsSnapshot } from './contracts';
import { sha256 } from '@noble/hashes/sha2.js';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { decodeRecordingEventsBlock } from '../../../../features/video/project/recording-events/blocks';
import type { RecordingEventsManifestEntry } from '../../../../features/video/project/recording-events/types';
import {
  RecordingEventsError,
  type RecordingEventsHead,
  type RecordingEventsIdentity,
  type StoredRecordingEventsBlock,
} from './contracts';

export const RECORDING_EVENTS_EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const recordingEventsHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
export const recordingEventsIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nullableInteger = (value: unknown) => value === null || isTrajectoryInteger(value);
export function isRecordingEventsIdentity(value: unknown): value is RecordingEventsIdentity {
  return (
    isPlainRecord(value) &&
    recordingEventsIdentifier(value['recordingId']) &&
    typeof value['eventStreamId'] === 'string' &&
    /^[a-f0-9]{32}$/.test(value['eventStreamId'])
  );
}
export function isRecordingEventsHead(value: unknown): value is RecordingEventsHead {
  if (!isPlainRecord(value) || !isRecordingEventsIdentity(value)) return false;
  const required = [
    'recordingId',
    'eventStreamId',
    'writerGeneration',
    'kind',
    'entryId',
    'sourceRecordingId',
    'revision',
    'retired',
    'finalized',
    'state',
    'activeSegment',
    'lastSegmentId',
    'hasGap',
    'activeInputs',
    'totalBlocks',
    'totalRecords',
    'totalBytes',
    'streamSha256',
  ];
  const optional = ['stagingJournalId', 'snapshotAssetId'];
  if (
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key)) ||
    !required.every((key) => Object.hasOwn(value, key))
  )
    return false;
  return (
    value['kind'] === 'head' &&
    value['entryId'] === 0 &&
    recordingEventsIdentifier(value['sourceRecordingId']) &&
    recordingEventsIdentifier(value['writerGeneration']) &&
    isTrajectoryInteger(value['revision']) &&
    value['revision'] > 0 &&
    typeof value['retired'] === 'boolean' &&
    typeof value['finalized'] === 'boolean' &&
    typeof value['hasGap'] === 'boolean' &&
    isTrajectoryInteger(value['activeInputs']) &&
    typeof value['state'] === 'string' &&
    ['complete', 'incomplete', 'unavailable'].includes(value['state']) &&
    nullableInteger(value['activeSegment']) &&
    nullableInteger(value['lastSegmentId']) &&
    (value['activeSegment'] === null || value['activeSegment'] === value['lastSegmentId']) &&
    isTrajectoryInteger(value['totalBlocks']) &&
    isTrajectoryInteger(value['totalRecords']) &&
    isTrajectoryInteger(value['totalBytes']) &&
    hash(value['streamSha256']) &&
    (value['totalBlocks'] !== 0 ||
      (value['totalRecords'] === 0 &&
        value['totalBytes'] === 0 &&
        value['streamSha256'] === RECORDING_EVENTS_EMPTY_SHA256)) &&
    value['activeInputs'] <= value['totalRecords'] &&
    value['totalRecords'] >= value['totalBlocks'] &&
    value['totalRecords'] <= value['totalBlocks'] * 512 &&
    value['totalBytes'] >= value['totalBlocks'] &&
    value['totalBytes'] <= value['totalBlocks'] * 65536 &&
    (value['state'] !== 'complete' ||
      (!value['hasGap'] &&
        value['activeInputs'] === 0 &&
        value['activeSegment'] === null &&
        value['finalized'])) &&
    (value['state'] !== 'unavailable' || value['finalized']) &&
    (!Object.hasOwn(value, 'stagingJournalId') ||
      recordingEventsIdentifier(value['stagingJournalId'])) &&
    (!Object.hasOwn(value, 'snapshotAssetId') ||
      (recordingEventsIdentifier(value['snapshotAssetId']) &&
        value['finalized'] &&
        !Object.hasOwn(value, 'stagingJournalId')))
  );
}
export function isRecordingEventsManifestEntry(
  value: unknown
): value is RecordingEventsManifestEntry {
  if (!isPlainRecord(value)) return false;
  const keys = [
    'sequence',
    'startTimeUs',
    'endTimeUs',
    'recordCount',
    'byteLength',
    'blockSha256',
    'prefixSha256',
  ];
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    isTrajectoryInteger(value['sequence']) &&
    isTrajectoryInteger(value['startTimeUs']) &&
    isTrajectoryInteger(value['endTimeUs']) &&
    isTrajectoryInteger(value['recordCount']) &&
    isTrajectoryInteger(value['byteLength']) &&
    value['endTimeUs'] >= value['startTimeUs'] &&
    value['recordCount'] >= 1 &&
    value['recordCount'] <= 512 &&
    value['byteLength'] >= 1 &&
    value['byteLength'] <= 65536 &&
    hash(value['blockSha256']) &&
    hash(value['prefixSha256'])
  );
}
export function admitStoredRecordingEventsBlock(value: unknown, head: RecordingEventsHead) {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 6 ||
    !isRecordingEventsIdentity(value) ||
    value['recordingId'] !== head.recordingId ||
    value['eventStreamId'] !== head.eventStreamId ||
    value['kind'] !== 'block' ||
    !isTrajectoryInteger(value['entryId']) ||
    !isRecordingEventsManifestEntry(value['entry']) ||
    value['entry'].sequence !== value['entryId'] ||
    !(value['bytes'] instanceof Uint8Array)
  )
    throw new RecordingEventsError('integrity');
  const entry = value['entry'];
  const bytes = value['bytes'];
  const block = decodeRecordingEventsBlock(bytes);
  if (
    !block ||
    bytes.byteLength !== entry.byteLength ||
    recordingEventsHex(sha256(bytes)) !== entry.blockSha256 ||
    block.recordingId !== head.sourceRecordingId ||
    block.eventStreamId !== head.eventStreamId ||
    block.sequence !== entry.sequence ||
    block.startTimeUs !== entry.startTimeUs ||
    block.endTimeUs !== entry.endTimeUs ||
    block.records.length !== entry.recordCount
  )
    throw new RecordingEventsError('integrity');
  const row: StoredRecordingEventsBlock = {
    recordingId: head.recordingId,
    eventStreamId: head.eventStreamId,
    kind: 'block',
    entryId: entry.sequence,
    entry,
    bytes,
  };
  return { row, block };
}

/** Binds compact snapshot metadata to the finalized original framed stream. */
export function isRecordingEventsSnapshot(
  value: unknown,
  descriptor: unknown
): value is RecordingEventsSnapshot {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isRecordingEventsDescriptor(descriptor) ||
    !descriptor.finalized ||
    descriptor.totalBlocks === 0
  )
    return false;
  const ref = parseAssetRef(value['ref']);
  return (
    isHistorySnapshotRef(ref, descriptor) && recordingEventsIdentifier(value['sourceRecordingId'])
  );
}

/** The marker fences stream IDs that were not yet known when their recording was deleted. */
export const recordingEventsRootFenceKey = (recordingId: string) => [
  recordingId,
  '0'.repeat(32),
  'root-fence',
  0,
];
export function isRecordingEventsRootFence(value: unknown, recordingId: string): boolean {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length === 4 &&
    value['recordingId'] === recordingId &&
    recordingEventsIdentifier(recordingId) &&
    value['eventStreamId'] === '0'.repeat(32) &&
    value['kind'] === 'root-fence' &&
    value['entryId'] === 0
  );
}
