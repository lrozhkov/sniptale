import { sha256 } from '@noble/hashes/sha2.js';
import { decodeCursorTrajectoryBlock, type PackedCursorTrajectoryBlock } from './blocks';
import { isCursorTrajectoryDescriptor, trajectoryRecordTimes } from './records';
import { CURSOR_TRAJECTORY_MAX_BLOCK_BYTES, type CursorTrajectorySegment } from './types';

export interface CursorTrajectoryStreamIdentity {
  sourceRecordingId: string;
  width: number;
  height: number;
  descriptor: unknown;
}

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

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
  const digest = sha256.create();
  const prefix = new Uint8Array(4);
  let prefixUsed = 0;
  let payload: Uint8Array | null = null;
  let payloadUsed = 0;
  let totalBlocks = 0;
  let totalRecords = 0;
  let totalSamples = 0;
  let totalBytes = 0;
  let segment: CursorTrajectorySegment | null = null;
  let lastSegmentId: number | null = null;
  let lastObservationSeq: number | null = null;
  let lastTimeUs = 0;
  let hasGap = false;

  const accept = async (bytes: Uint8Array): Promise<void> => {
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
    totalRecords += block.records.length;
    totalSamples += samples;
    totalBytes += bytes.byteLength;
    if (
      totalBlocks > descriptor.totalBlocks ||
      totalRecords > descriptor.totalRecords ||
      totalSamples > descriptor.totalSamples ||
      totalBytes > descriptor.totalBytes ||
      (descriptor.state === 'complete' && hasGap)
    )
      throw new Error('Cursor trajectory stream exceeds its descriptor.');
    digest.update(prefix).update(bytes);
    await onBlock({
      bytes,
      entry: {
        sequence: block.sequence,
        startTimeUs: block.startTimeUs,
        endTimeUs: block.endTimeUs,
        recordCount: block.records.length,
        sampleCount: samples,
        byteLength: bytes.byteLength,
        blockSha256: hex(sha256(bytes)),
        prefixSha256: hex(digest.clone().digest()),
      },
    });
    signal?.throwIfAborted();
  };

  return new WritableStream<Uint8Array>({
    async write(chunk) {
      signal?.throwIfAborted();
      if (!(chunk instanceof Uint8Array))
        throw new Error('Invalid cursor trajectory stream chunk.');
      let offset = 0;
      while (offset < chunk.byteLength) {
        signal?.throwIfAborted();
        if (!payload) {
          const count = Math.min(4 - prefixUsed, chunk.byteLength - offset);
          prefix.set(chunk.subarray(offset, offset + count), prefixUsed);
          prefixUsed += count;
          offset += count;
          if (prefixUsed !== 4) continue;
          const length = new DataView(prefix.buffer).getUint32(0, true);
          if (
            length === 0 ||
            length > CURSOR_TRAJECTORY_MAX_BLOCK_BYTES ||
            totalBlocks >= descriptor.totalBlocks ||
            length > descriptor.totalBytes - totalBytes
          )
            throw new Error('Invalid cursor trajectory stream frame length.');
          payload = new Uint8Array(length);
        }
        const count = Math.min(payload.byteLength - payloadUsed, chunk.byteLength - offset);
        payload.set(chunk.subarray(offset, offset + count), payloadUsed);
        payloadUsed += count;
        offset += count;
        if (payloadUsed === payload.byteLength) {
          await accept(payload);
          payload = null;
          payloadUsed = 0;
          prefixUsed = 0;
        }
      }
    },
    close() {
      signal?.throwIfAborted();
      if (
        prefixUsed !== 0 ||
        payload !== null ||
        totalBlocks !== descriptor.totalBlocks ||
        totalRecords !== descriptor.totalRecords ||
        totalSamples !== descriptor.totalSamples ||
        totalBytes !== descriptor.totalBytes ||
        hex(digest.digest()) !== descriptor.streamSha256 ||
        (descriptor.state === 'complete' && (segment !== null || hasGap))
      )
        throw new Error('Cursor trajectory stream is incomplete or corrupt.');
    },
  });
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
  const { descriptor } = identity;
  const size = descriptor.totalBytes + descriptor.totalBlocks * 4;
  if (!Number.isSafeInteger(size)) throw new Error('Invalid cursor trajectory stream size.');
  const readBlock = args.readBlock;
  const beforeClose = args.beforeClose;
  return {
    size,
    async pipeTo(sink, signal) {
      signal?.throwIfAborted();
      const target = sink.getWriter();
      const input = createCursorTrajectoryStreamSink(
        identity,
        async (block) => {
          const prefix = new Uint8Array(4);
          new DataView(prefix.buffer).setUint32(0, block.bytes.byteLength, true);
          await target.write(prefix);
          await target.write(block.bytes);
        },
        signal
      ).getWriter();
      try {
        for (let sequence = 0; sequence < descriptor.totalBlocks; sequence += 1) {
          signal?.throwIfAborted();
          const bytes = await readBlock(sequence);
          signal?.throwIfAborted();
          const prefix = new Uint8Array(4);
          new DataView(prefix.buffer).setUint32(0, bytes.byteLength, true);
          await input.write(prefix);
          await input.write(bytes);
        }
        await input.close();
        await beforeClose?.();
        signal?.throwIfAborted();
        await target.close();
      } catch (error) {
        await input.abort(error).catch(() => undefined);
        await target.abort(error).catch(() => undefined);
        throw error;
      } finally {
        input.releaseLock();
        target.releaseLock();
      }
    },
  };
}
