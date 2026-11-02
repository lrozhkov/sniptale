import {
  createRecordingHistoryIntegrity,
  createRecordingHistoryFrameSink,
  createRecordingHistoryFrameSource,
} from '../recording-history-stream';
import { decodeCursorTrajectoryBlock, type PackedCursorTrajectoryBlock } from './blocks';
import { isCursorTrajectoryDescriptor, trajectoryRecordTimes } from './records';
import { CURSOR_TRAJECTORY_MAX_BLOCK_BYTES, type CursorTrajectorySegment } from './types';

export interface CursorTrajectoryStreamIdentity {
  sourceRecordingId: string;
  width: number;
  height: number;
  descriptor: unknown;
}

function admitStreamIdentity(identity: CursorTrajectoryStreamIdentity) {
  const descriptor = structuredClone(identity.descriptor);
  if (
    !isCursorTrajectoryDescriptor(descriptor) ||
    !descriptor.finalized ||
    typeof identity.sourceRecordingId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(identity.sourceRecordingId) ||
    ![identity.width, identity.height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff
    )
  )
    throw new Error('Invalid cursor trajectory stream identity.');
  return {
    sourceRecordingId: identity.sourceRecordingId,
    width: identity.width,
    height: identity.height,
    descriptor,
  };
}

/** Reads the native length-prefixed stream with one bounded payload buffer and backpressure.
 * onBlock stages bytes only. Publication requires successful close and caller-owned commit.
 */
export function createCursorTrajectoryStreamSink(
  identity: CursorTrajectoryStreamIdentity,
  onBlock: (block: PackedCursorTrajectoryBlock) => Promise<void>,
  signal?: AbortSignal
): WritableStream<Uint8Array> {
  const { descriptor } = admitStreamIdentity(identity);
  const sourceRecordingId = identity.sourceRecordingId;
  const width = identity.width;
  const height = identity.height;
  const integrity = createRecordingHistoryIntegrity(
    descriptor,
    'Cursor trajectory stream exceeds its descriptor.'
  );
  let totalBlocks = 0;
  let totalSamples = 0;
  let segment: CursorTrajectorySegment | null = null;
  let lastSegmentId: number | null = null;
  let lastObservationSeq: number | null = null;
  let lastTimeUs = 0;
  let hasGap = false;

  const accept = async (bytes: Uint8Array, prefix: Uint8Array): Promise<void> => {
    const block = decodeCursorTrajectoryBlock(bytes, segment);
    if (
      !block ||
      block.recordingId !== sourceRecordingId ||
      block.trajectoryId !== descriptor.trajectoryId ||
      block.sequence !== totalBlocks
    )
      throw new Error('Invalid cursor trajectory stream block.');
    let samples = 0;
    for (const record of block.records) {
      const [from, to] = trajectoryRecordTimes(record);
      if (from < lastTimeUs) throw new Error('Cursor trajectory stream time moved backwards.');
      lastTimeUs = to;
      if (record.kind === 'segment') {
        if (
          segment ||
          record.width !== width ||
          record.height !== height ||
          (lastSegmentId === null ? record.segmentId !== 0 : record.segmentId <= lastSegmentId)
        )
          throw new Error('Invalid cursor trajectory stream segment.');
        segment = record;
        lastSegmentId = record.segmentId;
      }
      if (record.kind === 'sample') {
        if (lastObservationSeq !== null && record.observationSeq <= lastObservationSeq)
          throw new Error('Invalid cursor trajectory observation order.');
        lastObservationSeq = record.observationSeq;
        samples += 1;
      }
      if (record.kind === 'gap') hasGap = true;
      if (record.kind === 'boundary' || record.kind === 'gap') segment = null;
    }
    totalBlocks += 1;
    totalSamples += samples;
    if (totalSamples > descriptor.totalSamples || (descriptor.state === 'complete' && hasGap))
      throw new Error('Cursor trajectory stream exceeds its descriptor.');
    const hashes = integrity.append(bytes, prefix, block.records.length);
    await onBlock({
      bytes,
      entry: {
        sequence: block.sequence,
        startTimeUs: block.startTimeUs,
        endTimeUs: block.endTimeUs,
        recordCount: block.records.length,
        sampleCount: samples,
        byteLength: bytes.byteLength,
        ...hashes,
      },
    });
    signal?.throwIfAborted();
  };

  return createRecordingHistoryFrameSink(
    descriptor,
    {
      maxBlockBytes: CURSOR_TRAJECTORY_MAX_BLOCK_BYTES,
      invalidChunk: 'Invalid cursor trajectory stream chunk.',
      invalidLength: 'Invalid cursor trajectory stream frame length.',
      consume: accept,
      finish(complete) {
        if (
          !complete ||
          totalSamples !== descriptor.totalSamples ||
          !integrity.complete() ||
          (descriptor.state === 'complete' && (segment !== null || hasGap))
        )
          throw new Error('Cursor trajectory stream is incomplete or corrupt.');
      },
    },
    signal
  );
}

/** Rebuilds the frozen native framing from bounded original blocks. The caller owns read authority. */
export function createCursorTrajectoryStreamSource(args: {
  identity: CursorTrajectoryStreamIdentity;
  readBlock(sequence: number): Promise<Uint8Array>;
  beforeClose?(): Promise<void>;
}): {
  size: number;
  pipeTo(sink: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
} {
  const identity = admitStreamIdentity(args.identity);
  return createRecordingHistoryFrameSource(
    identity.descriptor,
    args,
    (consume, signal) =>
      createCursorTrajectoryStreamSink(identity, (block) => consume(block.bytes), signal),
    'Invalid cursor trajectory stream size.'
  );
}
