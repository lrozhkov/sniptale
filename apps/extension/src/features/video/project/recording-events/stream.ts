import {
  createRecordingHistoryIntegrity,
  createRecordingHistoryFrameSink,
  createRecordingHistoryFrameSource,
} from '../recording-history-stream';
import { decodeRecordingEventsBlock, type PackedRecordingEventsBlock } from './blocks';
import { isRecordingEventsDescriptor } from './records';
import { RECORDING_EVENTS_MAX_BLOCK_BYTES } from './types';

export interface RecordingEventsStreamIdentity {
  sourceRecordingId: string;
  descriptor: unknown;
}

function admitStreamIdentity(identity: RecordingEventsStreamIdentity) {
  const descriptor = structuredClone(identity.descriptor);
  if (
    !isRecordingEventsDescriptor(descriptor) ||
    !descriptor.finalized ||
    typeof identity.sourceRecordingId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(identity.sourceRecordingId)
  )
    throw new Error('Invalid recording events stream identity.');
  return {
    sourceRecordingId: identity.sourceRecordingId,
    descriptor,
  };
}

/** Reads the native length-prefixed stream with one bounded payload buffer and backpressure.
 * onBlock stages bytes and validates durable action/signal references and revisions.
 * Publication requires successful close and caller-owned commit.
 */
export function createRecordingEventsStreamSink(
  identity: RecordingEventsStreamIdentity,
  onBlock: (block: PackedRecordingEventsBlock) => Promise<void>,
  signal?: AbortSignal
): WritableStream<Uint8Array> {
  const { descriptor } = admitStreamIdentity(identity);
  const sourceRecordingId = identity.sourceRecordingId;
  const integrity = createRecordingHistoryIntegrity(
    descriptor,
    'Cursor trajectory stream exceeds its descriptor.'
  );
  let totalBlocks = 0;
  let segment: number | null = null;
  let lastSegmentId: number | null = null;
  let nextRecordSeq = 0;
  let hasGap = false;

  const accept = async (bytes: Uint8Array, prefix: Uint8Array): Promise<void> => {
    const block = decodeRecordingEventsBlock(bytes);
    if (
      !block ||
      block.recordingId !== sourceRecordingId ||
      block.eventStreamId !== descriptor.eventStreamId ||
      block.sequence !== totalBlocks
    )
      throw new Error('Invalid recording events stream block.');
    for (const record of block.records) {
      if (record.recordSeq !== nextRecordSeq++)
        throw new Error('Invalid recording events sequence.');
      if (record.kind === 'segment') {
        if (
          segment !== null ||
          (lastSegmentId === null ? record.segmentId !== 0 : record.segmentId <= lastSegmentId)
        )
          throw new Error('Invalid recording events segment.');
        segment = record.segmentId;
        lastSegmentId = record.segmentId;
      } else if (segment === null || record.segmentId !== segment) {
        throw new Error('Recording event is outside its segment.');
      }
      // Emission order can contain older facts. Do not sort or retime their envelopes.
      if (record.kind === 'gap') hasGap = true;
      if (record.kind === 'boundary' || record.kind === 'gap') segment = null;
    }
    totalBlocks += 1;
    if (descriptor.state === 'complete' && hasGap)
      throw new Error('Cursor trajectory stream exceeds its descriptor.');
    const hashes = integrity.append(bytes, prefix, block.records.length);
    await onBlock({
      bytes,
      entry: {
        sequence: block.sequence,
        startTimeUs: block.startTimeUs,
        endTimeUs: block.endTimeUs,
        recordCount: block.records.length,
        byteLength: bytes.byteLength,
        ...hashes,
      },
    });
    signal?.throwIfAborted();
  };

  return createRecordingHistoryFrameSink(
    descriptor,
    {
      maxBlockBytes: RECORDING_EVENTS_MAX_BLOCK_BYTES,
      invalidChunk: 'Invalid recording events stream chunk.',
      invalidLength: 'Invalid recording events stream frame length.',
      consume: accept,
      finish(complete) {
        if (
          !complete ||
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
export function createRecordingEventsStreamSource(args: {
  identity: RecordingEventsStreamIdentity;
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
      createRecordingEventsStreamSink(identity, (block) => consume(block.bytes), signal),
    'Invalid recording events stream size.'
  );
}
