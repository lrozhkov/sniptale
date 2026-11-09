import type { AssetOpfsOptions } from '../../assets/opfs-store';
import { stageHistorySnapshot, prepareHistorySnapshot } from '../history-snapshot-io';
import type { AssetRef } from '../../assets/contracts';
import type { RecordingEventsDescriptor } from '../../../../features/video/project/recording-events/types';
import {
  RecordingEventsError,
  type RecordingEventsIdentity,
  type RecordingEventsWriter,
} from './contracts';
import type { createRecordingEventsStore } from './store';
import { openRecordingEventsStream } from './reader';
import {
  createRecordingEventsStreamSink,
  type RecordingEventsStreamIdentity,
} from '../../../../features/video/project/recording-events/stream';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';

/** Stages original framed bytes. The caller owns publication and the private identity. */
export async function stageRecordingEventsStream(args: {
  store: Pick<
    ReturnType<typeof createRecordingEventsStore>,
    'begin' | 'append' | 'finalize' | 'retire'
  >;
  identity: RecordingEventsIdentity;
  sourceIdentity: RecordingEventsStreamIdentity;
  source: {
    size: number;
    pipeTo(target: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
  };
  stagingJournalId?: string;
  signal?: AbortSignal;
}): Promise<RecordingEventsWriter> {
  const context = structuredClone(args.sourceIdentity);
  const descriptor = context.descriptor;
  if (
    !isRecordingEventsDescriptor(descriptor) ||
    !descriptor.finalized ||
    args.identity.eventStreamId !== descriptor.eventStreamId ||
    args.identity.recordingId === context.sourceRecordingId ||
    !Number.isSafeInteger(args.source.size) ||
    args.source.size !== descriptor.totalBytes + descriptor.totalBlocks * 4
  )
    throw new RecordingEventsError('integrity');
  // Construct the sink before begin so invalid context cannot create a private head.
  let writer: RecordingEventsWriter;
  const sink = createRecordingEventsStreamSink(
    context,
    (block) => args.store.append(writer, block),
    args.signal
  );
  args.signal?.throwIfAborted();
  writer = await args.store.begin(args.identity, context.sourceRecordingId, args.stagingJournalId);
  await stageHistorySnapshot({
    source: args.source,
    sink,
    signal: args.signal,
    integrityError: () => new RecordingEventsError('integrity'),
    finalize: async () => {
      await args.store.finalize(writer, descriptor);
    },
    retire: () => args.store.retire(writer, writer.writerGeneration),
    cleanupMessage: 'Event staging and cleanup failed.',
  });
  return writer;
}

export interface PreparedRecordingEventsSnapshot {
  ref: AssetRef;
  writer: RecordingEventsWriter;
  sourceRecordingId: string;
  descriptor: RecordingEventsDescriptor;
}

/** Prepares a verified immutable transfer copy. Its caller must claim or discard the asset. */
export async function prepareRecordingEventsSnapshot(
  args: {
    store: Pick<ReturnType<typeof createRecordingEventsStore>, 'getHead' | 'readBlock'>;
    identity: RecordingEventsIdentity;
    descriptor: unknown;
    signal?: AbortSignal;
  },
  assetOptions: AssetOpfsOptions = {}
): Promise<PreparedRecordingEventsSnapshot> {
  args.signal?.throwIfAborted();
  const identity = { ...args.identity };
  const stream = await openRecordingEventsStream(args.store, identity, args.descriptor);
  return prepareHistorySnapshot({
    stream,
    expectedSha256: stream.source.descriptor.streamSha256,
    filename: 'events.bin',
    signal: args.signal,
    assetOptions,
    integrityError: () => new RecordingEventsError('integrity'),
    cleanupMessage: 'Event snapshot preparation and cleanup failed.',
    async admit(ref, actual) {
      const head = await args.store.getHead(identity);
      args.signal?.throwIfAborted();
      if (
        !head ||
        head.writerGeneration !== stream.writerGeneration ||
        !head.finalized ||
        head.streamSha256 !== actual
      )
        throw new RecordingEventsError('stale-writer');
      return {
        ref: { ...ref, sha256: actual },
        writer: { ...identity, writerGeneration: stream.writerGeneration },
        ...stream.source,
      };
    },
  });
}
