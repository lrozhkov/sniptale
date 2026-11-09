import type { AssetOpfsOptions } from '../../assets/opfs-store';
import { stageHistorySnapshot, prepareHistorySnapshot } from '../history-snapshot-io';
import type { AssetRef } from '../../assets/contracts';
import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';
import {
  RecordingCursorTrajectoryError,
  type RecordingCursorTrajectoryIdentity,
  type RecordingCursorTrajectoryWriter,
} from './contracts';
import type { createRecordingCursorTrajectoryStore } from './store';
import { openRecordingCursorTrajectoryStream } from './reader';
import {
  createCursorTrajectoryStreamSink,
  type CursorTrajectoryStreamIdentity,
} from '../../../../features/video/project/cursor-trajectory/stream';
import { isCursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/records';

/** Stages original framed bytes. The caller owns publication and the private identity. */
export async function stageRecordingCursorTrajectoryStream(args: {
  store: Pick<
    ReturnType<typeof createRecordingCursorTrajectoryStore>,
    'begin' | 'append' | 'finalize' | 'retire'
  >;
  identity: RecordingCursorTrajectoryIdentity;
  sourceIdentity: CursorTrajectoryStreamIdentity;
  source: {
    size: number;
    pipeTo(target: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
  };
  stagingJournalId?: string;
  signal?: AbortSignal;
}): Promise<RecordingCursorTrajectoryWriter> {
  const context = structuredClone(args.sourceIdentity);
  const descriptor = context.descriptor;
  if (
    !isCursorTrajectoryDescriptor(descriptor) ||
    !descriptor.finalized ||
    args.identity.trajectoryId !== descriptor.trajectoryId ||
    args.identity.recordingId === context.sourceRecordingId ||
    !Number.isSafeInteger(args.source.size) ||
    args.source.size !== descriptor.totalBytes + descriptor.totalBlocks * 4
  )
    throw new RecordingCursorTrajectoryError('integrity');
  // Construct the sink before begin so invalid context cannot create a private head.
  let writer: RecordingCursorTrajectoryWriter;
  const sink = createCursorTrajectoryStreamSink(
    context,
    (block) => args.store.append(writer, block),
    args.signal
  );
  args.signal?.throwIfAborted();
  writer = await args.store.begin(
    args.identity,
    { width: context.width, height: context.height },
    context.sourceRecordingId,
    args.stagingJournalId
  );
  await stageHistorySnapshot({
    source: args.source,
    sink,
    signal: args.signal,
    integrityError: () => new RecordingCursorTrajectoryError('integrity'),
    finalize: async () => {
      await args.store.finalize(writer, descriptor, descriptor.state);
    },
    retire: () => args.store.retire(writer, writer.writerGeneration),
    cleanupMessage: 'Cursor trajectory staging and cleanup failed.',
  });
  return writer;
}

interface PreparedRecordingCursorTrajectorySnapshot {
  ref: AssetRef;
  writer: RecordingCursorTrajectoryWriter;
  sourceRecordingId: string;
  width: number;
  height: number;
  descriptor: CursorTrajectoryDescriptor;
}

/** Prepares a verified immutable transfer copy. Its caller must claim or discard the asset. */
export async function prepareRecordingCursorTrajectorySnapshot(
  args: {
    store: Pick<ReturnType<typeof createRecordingCursorTrajectoryStore>, 'getHead' | 'readBlock'>;
    identity: RecordingCursorTrajectoryIdentity;
    descriptor: unknown;
    signal?: AbortSignal;
  },
  assetOptions: AssetOpfsOptions = {}
): Promise<PreparedRecordingCursorTrajectorySnapshot> {
  args.signal?.throwIfAborted();
  const identity = { ...args.identity };
  const stream = await openRecordingCursorTrajectoryStream(args.store, identity, args.descriptor);
  return prepareHistorySnapshot({
    stream,
    expectedSha256: stream.source.descriptor.streamSha256,
    filename: 'cursor.bin',
    signal: args.signal,
    assetOptions,
    integrityError: () => new RecordingCursorTrajectoryError('integrity'),
    cleanupMessage: 'Cursor snapshot preparation and cleanup failed.',
    async admit(ref, actual) {
      const head = await args.store.getHead(identity);
      args.signal?.throwIfAborted();
      if (
        !head ||
        head.writerGeneration !== stream.writerGeneration ||
        !head.finalized ||
        head.streamSha256 !== actual
      )
        throw new RecordingCursorTrajectoryError('stale-writer');
      return {
        ref: { ...ref, sha256: actual },
        writer: { ...identity, writerGeneration: stream.writerGeneration },
        ...stream.source,
      };
    },
  });
}
