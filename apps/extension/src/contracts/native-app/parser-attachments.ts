import {
  isCursorTrajectoryDescriptor,
  isTrajectoryInteger,
} from '../../features/video/project/cursor-trajectory/records';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryManifestEntry,
} from '../../features/video/project/cursor-trajectory/types';
import type {
  RecordingEventsDescriptor,
  RecordingEventsManifestEntry,
} from '../../features/video/project/recording-events/types';
import {
  fail,
  ok,
  isRecord,
  isAsciiId,
  hasProtocolVersion,
  type ParseResult,
} from './parser-shared';
import type {
  AppRecordingAttachmentManifestMessage,
  AppRecordingAttachmentChunkMessage,
  AppRecordingAttachmentAvailableMessage,
  AppRecordingEventsManifestMessage,
  AppRecordingEventsChunkMessage,
  AppRecordingEventsAvailableMessage,
  NativeHistoryInboundMessage,
} from './attachment-message-types';

const identityKeys = ['type', 'protocolVersion', 'controllerLeaseId', 'recordingId'];
const manifestKeys = ['requestId', 'descriptor', 'fromSequence', 'entries', 'nextSequence'];
const chunkKeys = [
  'requestId',
  'sequence',
  'blockBytes',
  'blockSha256',
  'chunkIndex',
  'chunkCount',
  'chunkByteOffset',
  'chunkRawBytes',
  'chunkSha256',
  'base64',
];
const entryKeys = [
  'sequence',
  'startTimeUs',
  'endTimeUs',
  'recordCount',
  'byteLength',
  'blockSha256',
  'prefixSha256',
];
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const streamId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const bounded = (value: unknown, minimum: number, maximum: number): value is number =>
  isTrajectoryInteger(value) && value >= minimum && value <= maximum;
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function envelope(
  value: Record<string, unknown>,
  identity: 'trajectoryId' | 'eventStreamId',
  fields: readonly string[]
) {
  return (
    exactKeys(value, [...identityKeys, identity, ...fields]) &&
    hasProtocolVersion(value) &&
    isAsciiId(value['controllerLeaseId']) &&
    isAsciiId(value['recordingId']) &&
    streamId(value[identity])
  );
}
function isEntry(
  value: unknown,
  cursor: boolean
): value is CursorTrajectoryManifestEntry | RecordingEventsManifestEntry {
  return (
    isRecord(value) &&
    exactKeys(value, cursor ? [...entryKeys, 'sampleCount'] : entryKeys) &&
    isTrajectoryInteger(value['sequence']) &&
    isTrajectoryInteger(value['startTimeUs']) &&
    isTrajectoryInteger(value['endTimeUs']) &&
    value['endTimeUs'] >= value['startTimeUs'] &&
    bounded(value['recordCount'], 1, 512) &&
    bounded(value['byteLength'], 1, 65536) &&
    hash(value['blockSha256']) &&
    hash(value['prefixSha256']) &&
    (!cursor || bounded(value['sampleCount'], 0, value['recordCount']))
  );
}
function manifestPage(
  value: Record<string, unknown>,
  descriptor: CursorTrajectoryDescriptor | RecordingEventsDescriptor,
  cursor: boolean
) {
  if (
    !isAsciiId(value['requestId']) ||
    !isTrajectoryInteger(value['fromSequence']) ||
    value['fromSequence'] > descriptor.totalBlocks ||
    !Array.isArray(value['entries']) ||
    value['entries'].length > 32
  )
    return false;
  let records = 0,
    bytes = 0,
    samples = 0;
  for (const [index, entry] of value['entries'].entries()) {
    if (!isEntry(entry, cursor) || entry.sequence !== value['fromSequence'] + index) return false;
    records += entry.recordCount;
    bytes += entry.byteLength;
    if ('sampleCount' in entry && isTrajectoryInteger(entry.sampleCount))
      samples += entry.sampleCount;
  }
  const end = value['fromSequence'] + value['entries'].length;
  return (
    end <= descriptor.totalBlocks &&
    (end === descriptor.totalBlocks || value['entries'].length > 0) &&
    value['nextSequence'] === (end < descriptor.totalBlocks ? end : null) &&
    records <= descriptor.totalRecords &&
    bytes <= descriptor.totalBytes &&
    (!('totalSamples' in descriptor) || samples <= descriptor.totalSamples)
  );
}
function chunk(value: Record<string, unknown>) {
  if (
    !isAsciiId(value['requestId']) ||
    !isTrajectoryInteger(value['sequence']) ||
    !bounded(value['blockBytes'], 1, 65536) ||
    !hash(value['blockSha256']) ||
    !bounded(value['chunkCount'], 1, 2) ||
    !bounded(value['chunkIndex'], 0, value['chunkCount'] - 1) ||
    !bounded(value['chunkRawBytes'], 1, 32768) ||
    !isTrajectoryInteger(value['chunkByteOffset']) ||
    value['chunkCount'] !== Math.ceil(value['blockBytes'] / 32768) ||
    value['chunkByteOffset'] !== value['chunkIndex'] * 32768 ||
    value['chunkRawBytes'] !== Math.min(32768, value['blockBytes'] - value['chunkIndex'] * 32768) ||
    !hash(value['chunkSha256'])
  )
    return false;
  const base64 = value['base64'];
  if (typeof base64 !== 'string' || base64.length !== Math.ceil(value['chunkRawBytes'] / 3) * 4)
    return false;
  try {
    const raw = atob(base64);
    return raw.length === value['chunkRawBytes'] && btoa(raw) === base64;
  } catch {
    return false;
  }
}
function cursorManifest(value: unknown): value is AppRecordingAttachmentManifestMessage {
  return (
    isRecord(value) &&
    envelope(value, 'trajectoryId', manifestKeys) &&
    isCursorTrajectoryDescriptor(value['descriptor']) &&
    value['descriptor'].trajectoryId === value['trajectoryId'] &&
    manifestPage(value, value['descriptor'], true)
  );
}
function eventsManifest(value: unknown): value is AppRecordingEventsManifestMessage {
  return (
    isRecord(value) &&
    envelope(value, 'eventStreamId', manifestKeys) &&
    isRecordingEventsDescriptor(value['descriptor']) &&
    value['descriptor'].eventStreamId === value['eventStreamId'] &&
    manifestPage(value, value['descriptor'], false)
  );
}
function cursorChunk(value: unknown): value is AppRecordingAttachmentChunkMessage {
  return isRecord(value) && envelope(value, 'trajectoryId', chunkKeys) && chunk(value);
}
function eventsChunk(value: unknown): value is AppRecordingEventsChunkMessage {
  return isRecord(value) && envelope(value, 'eventStreamId', chunkKeys) && chunk(value);
}
function cursorAvailable(value: unknown): value is AppRecordingAttachmentAvailableMessage {
  return (
    isRecord(value) &&
    envelope(value, 'trajectoryId', ['videoSha256', 'descriptor']) &&
    hash(value['videoSha256']) &&
    isCursorTrajectoryDescriptor(value['descriptor']) &&
    value['descriptor'].trajectoryId === value['trajectoryId']
  );
}
function eventsAvailable(value: unknown): value is AppRecordingEventsAvailableMessage {
  return (
    isRecord(value) &&
    envelope(value, 'eventStreamId', ['videoSha256', 'descriptor']) &&
    hash(value['videoSha256']) &&
    isRecordingEventsDescriptor(value['descriptor']) &&
    value['descriptor'].eventStreamId === value['eventStreamId']
  );
}

/** Validates bounded wire envelopes. The receiver must verify hashes and its current assignment. */
export function parseNativeHistoryInboundMessage(
  value: unknown
): ParseResult<NativeHistoryInboundMessage> {
  if (!isRecord(value)) return fail('malformed-message', 'Invalid recording history message.');
  switch (value['type']) {
    case 'app.recording.attachment.manifest':
      if (cursorManifest(value)) return ok(value);
      break;
    case 'app.recording.attachment.chunk':
      if (cursorChunk(value)) return ok(value);
      break;
    case 'app.recording.attachment.available':
      if (cursorAvailable(value)) return ok(value);
      break;
    case 'app.recording.events.manifest':
      if (eventsManifest(value)) return ok(value);
      break;
    case 'app.recording.events.chunk':
      if (eventsChunk(value)) return ok(value);
      break;
    case 'app.recording.events.available':
      if (eventsAvailable(value)) return ok(value);
      break;
  }
  return fail('malformed-message', 'Invalid recording history message.');
}
