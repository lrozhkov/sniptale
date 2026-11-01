import { sha256 } from '@noble/hashes/sha2.js';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isTrajectoryInteger } from '../cursor-trajectory/records';
import { decodeRecordingEventsJson } from './json';
import { isRecordingEventRecord } from './records';
import {
  RECORDING_EVENTS_MAX_BLOCK_BYTES,
  RECORDING_EVENTS_MAX_BLOCK_RECORDS,
  type RecordingEventRecord,
  type RecordingEventsBlock,
  type RecordingEventsManifestEntry,
} from './types';

const encoder = new TextEncoder();
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const streamPattern = /^[a-f0-9]{32}$/;
const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function timeBounds(record: RecordingEventRecord): readonly [number, number] {
  return [
    record.activeTimeUs,
    record.kind === 'gap'
      ? Math.max(record.activeTimeUs, record.toTimeUs ?? record.activeTimeUs)
      : record.activeTimeUs,
  ];
}

/** Parses one original block. The durable stream owner must also verify references and lifecycle. */
export function decodeRecordingEventsBlock(bytes: Uint8Array): RecordingEventsBlock | null {
  const value = decodeRecordingEventsJson(bytes);
  const keys = [
    'formatVersion',
    'recordingId',
    'eventStreamId',
    'sequence',
    'startTimeUs',
    'endTimeUs',
    'records',
  ];
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    value['formatVersion'] !== 1 ||
    typeof value['recordingId'] !== 'string' ||
    !idPattern.test(value['recordingId']) ||
    typeof value['eventStreamId'] !== 'string' ||
    !streamPattern.test(value['eventStreamId']) ||
    !isTrajectoryInteger(value['sequence']) ||
    !isTrajectoryInteger(value['startTimeUs']) ||
    !isTrajectoryInteger(value['endTimeUs']) ||
    !Array.isArray(value['records']) ||
    value['records'].length < 1 ||
    value['records'].length > RECORDING_EVENTS_MAX_BLOCK_RECORDS ||
    !value['records'].every(isRecordingEventRecord)
  )
    return null;
  let from = Infinity;
  let to = 0;
  let previous: number | null = null;
  for (const record of value['records']) {
    if (previous !== null && record.recordSeq !== previous + 1) return null;
    if (previous === null && value['sequence'] === 0 && record.recordSeq !== 0) return null;
    const bounds = timeBounds(record);
    from = Math.min(from, bounds[0]);
    to = Math.max(to, bounds[1]);
    previous = record.recordSeq;
  }
  if (from !== value['startTimeUs'] || to !== value['endTimeUs']) return null;
  return {
    formatVersion: 1,
    recordingId: value['recordingId'],
    eventStreamId: value['eventStreamId'],
    sequence: value['sequence'],
    startTimeUs: from,
    endTimeUs: to,
    records: value['records'],
  };
}

export interface PackedRecordingEventsBlock {
  bytes: Uint8Array;
  entry: RecordingEventsManifestEntry;
}

/** Greedy source-byte packing. It owns only one pending block and a digest state. */
export function createRecordingEventsBlockPacker(recordingId: string, eventStreamId: string) {
  if (!idPattern.test(recordingId) || !streamPattern.test(eventStreamId))
    throw new Error('Invalid recording event identity.');
  const stream = sha256.create();
  let records: string[] = [];
  let bodyBytes = 0;
  let startTimeUs = Infinity;
  let endTimeUs = 0;
  let nextRecordSeq = 0;
  let totalBlocks = 0;
  let totalRecords = 0;
  let totalBytes = 0;
  let finished = false;
  const header = (from: number, to: number, sequence = totalBlocks) => ({
    prefix: [
      '{"formatVersion":1,',
      `"recordingId":${JSON.stringify(recordingId)},`,
      `"eventStreamId":${JSON.stringify(eventStreamId)},`,
      `"sequence":${sequence},"startTimeUs":${from},"endTimeUs":${to},"records":[`,
    ].join(''),
    suffix: ']}',
  });
  const size = (from: number, to: number, body: number, count: number, sequence = totalBlocks) => {
    const { prefix, suffix } = header(from, to, sequence);
    return encoder.encode(prefix).byteLength + suffix.length + body + Math.max(0, count - 1);
  };
  const seal = (): PackedRecordingEventsBlock[] => {
    if (records.length === 0) return [];
    if (
      ![
        totalBlocks + 1,
        totalRecords + records.length,
        totalBytes + RECORDING_EVENTS_MAX_BLOCK_BYTES,
      ].every(isTrajectoryInteger)
    )
      throw new RangeError('Recording event counters exceed the integer range.');
    const { prefix, suffix } = header(startTimeUs, endTimeUs);
    const bytes = encoder.encode(prefix + records.join(',') + suffix);
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.byteLength, true);
    stream.update(length);
    stream.update(bytes);
    const entry: RecordingEventsManifestEntry = {
      sequence: totalBlocks,
      startTimeUs,
      endTimeUs,
      recordCount: records.length,
      byteLength: bytes.byteLength,
      blockSha256: hex(sha256(bytes)),
      prefixSha256: hex(stream.clone().digest()),
    };
    totalBlocks++;
    totalRecords += records.length;
    totalBytes += bytes.byteLength;
    records = [];
    bodyBytes = 0;
    startTimeUs = Infinity;
    endTimeUs = 0;
    return [{ bytes, entry }];
  };
  return {
    append(value: unknown): PackedRecordingEventsBlock[] {
      if (finished || !isRecordingEventRecord(value) || value.recordSeq !== nextRecordSeq)
        throw new Error('Invalid recording event record.');
      const text = JSON.stringify(value);
      const bytes = encoder.encode(text).byteLength;
      const [from, to] = timeBounds(value);
      // Refuse an impossible record before returning or changing the preceding block.
      if (size(from, to, bytes, 1) > RECORDING_EVENTS_MAX_BLOCK_BYTES)
        throw new Error('Recording event record exceeds the block bound.');
      const mustSeal =
        records.length > 0 &&
        (records.length === RECORDING_EVENTS_MAX_BLOCK_RECORDS ||
          size(
            Math.min(startTimeUs, from),
            Math.max(endTimeUs, to),
            bodyBytes + bytes,
            records.length + 1
          ) > RECORDING_EVENTS_MAX_BLOCK_BYTES);
      // Check the next header before sealing so refusal preserves all unreturned bytes.
      if (
        size(from, to, bytes, 1, totalBlocks + (mustSeal ? 1 : 0)) >
        RECORDING_EVENTS_MAX_BLOCK_BYTES
      )
        throw new Error('Recording event record exceeds the block bound.');
      const output = mustSeal ? seal() : [];
      records.push(text);
      bodyBytes += bytes;
      startTimeUs = Math.min(startTimeUs, from);
      endTimeUs = Math.max(endTimeUs, to);
      nextRecordSeq++;
      if (value.kind === 'boundary' || value.kind === 'gap') output.push(...seal());
      return output;
    },
    finish(): PackedRecordingEventsBlock[] {
      if (finished) return [];
      finished = true;
      return seal();
    },
    summary() {
      return { totalBlocks, totalRecords, totalBytes, streamSha256: hex(stream.clone().digest()) };
    },
    get pendingRecordCount() {
      return records.length;
    },
  };
}
