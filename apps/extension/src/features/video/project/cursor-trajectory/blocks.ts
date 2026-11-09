import { sha256 } from '@noble/hashes/sha2.js';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryRecord,
  isTrajectoryInteger,
  trajectoryRecordFitsSegment,
  trajectoryRecordTimes,
} from './records';
import {
  CURSOR_TRAJECTORY_MAX_BLOCK_BYTES,
  CURSOR_TRAJECTORY_MAX_BLOCK_RECORDS,
  type CursorTrajectoryBlock,
  type CursorTrajectoryManifestEntry,
  type CursorTrajectoryRecord,
  type CursorTrajectorySegment,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const recordingIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const trajectoryIdPattern = /^[a-f0-9]{32}$/;

function canonicalValue(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (!isPlainRecord(value)) throw new Error('Invalid cursor trajectory value.');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`)
    .join(',')}}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Encodes a validated closed record; no free-form strings or extra keys enter blocks. */
export function encodeCursorTrajectoryRecord(value: unknown): string {
  if (!isCursorTrajectoryRecord(value)) throw new Error('Invalid cursor trajectory record.');
  return canonicalValue(value);
}

function isBlock(value: unknown): value is CursorTrajectoryBlock {
  if (!isPlainRecord(value)) return false;
  const keys = [
    'formatVersion',
    'recordingId',
    'trajectoryId',
    'sequence',
    'startTimeUs',
    'endTimeUs',
    'records',
  ];
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    value['formatVersion'] === 1 &&
    typeof value['recordingId'] === 'string' &&
    recordingIdPattern.test(value['recordingId']) &&
    typeof value['trajectoryId'] === 'string' &&
    trajectoryIdPattern.test(value['trajectoryId']) &&
    isTrajectoryInteger(value['sequence']) &&
    isTrajectoryInteger(value['startTimeUs']) &&
    isTrajectoryInteger(value['endTimeUs']) &&
    Array.isArray(value['records']) &&
    value['records'].length > 0 &&
    value['records'].length <= CURSOR_TRAJECTORY_MAX_BLOCK_RECORDS &&
    value['records'].every(isCursorTrajectoryRecord)
  );
}

/** Parses one canonical block. The stream reader supplies the preceding segment when required. */
export function decodeCursorTrajectoryBlock(
  bytes: Uint8Array,
  initialSegment: CursorTrajectorySegment | null = null
): CursorTrajectoryBlock | null {
  if (bytes.byteLength > CURSOR_TRAJECTORY_MAX_BLOCK_BYTES) return null;
  try {
    const text = decoder.decode(bytes);
    const value: unknown = JSON.parse(text);
    if (!isBlock(value) || canonicalValue(value) !== text) return null;
    let segment = initialSegment;
    let start = Infinity;
    let end = 0;
    for (const record of value.records) {
      if (!trajectoryRecordFitsSegment(record, segment)) return null;
      if (record.kind === 'segment') segment = record;
      const [from, to] = trajectoryRecordTimes(record);
      start = Math.min(start, from);
      end = Math.max(end, to);
      if (record.kind === 'boundary' || record.kind === 'gap') segment = null;
    }
    return value.startTimeUs === start && value.endTimeUs === end ? value : null;
  } catch {
    return null;
  }
}

export interface PackedCursorTrajectoryBlock {
  bytes: Uint8Array;
  entry: CursorTrajectoryManifestEntry;
}

interface CursorTrajectoryPackingSummary {
  totalBlocks: number;
  totalRecords: number;
  totalSamples: number;
  totalBytes: number;
  streamSha256: string;
}

interface CursorTrajectoryBlockPacker {
  append(record: CursorTrajectoryRecord): PackedCursorTrajectoryBlock[];
  finish(): PackedCursorTrajectoryBlock[];
  summary(): CursorTrajectoryPackingSummary;
}

/** Greedy canonical packing, with boundary/gap barriers and one pending block. No I/O. */
export function createCursorTrajectoryBlockPacker(
  recordingId: string,
  trajectoryId: string
): CursorTrajectoryBlockPacker {
  if (!recordingIdPattern.test(recordingId) || !trajectoryIdPattern.test(trajectoryId))
    throw new Error('Invalid cursor trajectory identity.');
  const stream = sha256.create();
  let records: string[] = [];
  let recordBytes = 0;
  let samples = 0;
  let start = Infinity;
  let end = 0;
  let segment: CursorTrajectorySegment | null = null;
  let finished = false;
  let totalBlocks = 0;
  let totalRecords = 0;
  let totalSamples = 0;
  let totalBytes = 0;

  const envelope = (sequence: number, from: number, to: number) => ({
    prefix: `{"endTimeUs":${to},"formatVersion":1,"recordingId":${JSON.stringify(recordingId)},"records":[`,
    suffix: `],"sequence":${sequence},"startTimeUs":${from},"trajectoryId":${JSON.stringify(trajectoryId)}}`,
  });
  const byteLength = (
    sequence: number,
    from: number,
    to: number,
    length: number,
    count: number
  ) => {
    const { prefix, suffix } = envelope(sequence, from, to);
    return prefix.length + suffix.length + length + Math.max(0, count - 1);
  };
  const seal = (): PackedCursorTrajectoryBlock[] => {
    if (records.length === 0) return [];
    if (
      ![
        totalBlocks + 1,
        totalRecords + records.length,
        totalSamples + samples,
        totalBytes + CURSOR_TRAJECTORY_MAX_BLOCK_BYTES,
      ].every(isTrajectoryInteger)
    )
      throw new RangeError('Cursor trajectory counters exceed the integer range.');
    const { prefix, suffix } = envelope(totalBlocks, start, end);
    const bytes = encoder.encode(prefix + records.join(',') + suffix);
    const lengthPrefix = new Uint8Array(4);
    new DataView(lengthPrefix.buffer).setUint32(0, bytes.byteLength, true);
    stream.update(lengthPrefix).update(bytes);
    const entry: CursorTrajectoryManifestEntry = {
      sequence: totalBlocks,
      startTimeUs: start,
      endTimeUs: end,
      recordCount: records.length,
      sampleCount: samples,
      byteLength: bytes.byteLength,
      blockSha256: hex(sha256(bytes)),
      prefixSha256: hex(stream.clone().digest()),
    };
    totalBlocks += 1;
    totalRecords += records.length;
    totalSamples += samples;
    totalBytes += bytes.byteLength;
    records = [];
    recordBytes = 0;
    samples = 0;
    start = Infinity;
    end = 0;
    return [{ bytes, entry }];
  };
  return {
    append(record) {
      if (finished) throw new Error('Cursor trajectory packing is finalized.');
      const encoded = encodeCursorTrajectoryRecord(record);
      if (!trajectoryRecordFitsSegment(record, segment))
        throw new Error('Cursor trajectory record does not match its segment.');
      const [from, to] = trajectoryRecordTimes(record);
      const fits =
        records.length < CURSOR_TRAJECTORY_MAX_BLOCK_RECORDS &&
        byteLength(
          totalBlocks,
          Math.min(start, from),
          Math.max(end, to),
          recordBytes + encoded.length,
          records.length + 1
        ) <= CURSOR_TRAJECTORY_MAX_BLOCK_BYTES;
      // Check before sealing so an invalid next record cannot consume an unreturned valid block.
      if (
        !fits &&
        byteLength(totalBlocks + (records.length > 0 ? 1 : 0), from, to, encoded.length, 1) >
          CURSOR_TRAJECTORY_MAX_BLOCK_BYTES
      )
        throw new RangeError('Cursor trajectory record exceeds the block byte limit.');
      const output = fits ? [] : seal();
      records.push(encoded);
      recordBytes += encoded.length;
      samples += record.kind === 'sample' ? 1 : 0;
      start = Math.min(start, from);
      end = Math.max(end, to);
      if (record.kind === 'segment') segment = structuredClone(record);
      if (record.kind === 'boundary' || record.kind === 'gap') {
        segment = null;
        output.push(...seal());
      }
      return output;
    },
    finish() {
      const output = seal();
      finished = true;
      return output;
    },
    summary: () => ({
      totalBlocks,
      totalRecords,
      totalSamples,
      totalBytes,
      streamSha256: hex(stream.clone().digest()),
    }),
  };
}
