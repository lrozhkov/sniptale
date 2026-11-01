import { sha256 } from '@noble/hashes/sha2.js';
import {
  createAssetObjectWriter,
  readAssetFile,
  type AssetOpfsOptions,
} from '../../assets/opfs-store';
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
  const sinkWriter = sink.getWriter();
  let closed = false;
  let received = 0;
  try {
    await args.source.pipeTo(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          args.signal?.throwIfAborted();
          received += chunk.byteLength;
          if (!Number.isSafeInteger(received) || received > args.source.size)
            throw new RecordingEventsError('integrity');
          await sinkWriter.write(chunk);
        },
        async close() {
          await sinkWriter.close();
          closed = true;
        },
        async abort(reason) {
          await sinkWriter.abort(reason);
        },
      }),
      args.signal
    );
    args.signal?.throwIfAborted();
    if (!closed || received !== args.source.size) throw new RecordingEventsError('integrity');
    await args.store.finalize(writer, descriptor);
    return writer;
  } catch (error) {
    await sinkWriter.abort(error).catch(() => undefined);
    try {
      await args.store.retire(writer, writer.writerGeneration);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Event staging and cleanup failed.', {
        cause: cleanup,
      });
    }
    throw error;
  } finally {
    sinkWriter.releaseLock();
  }
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
  const writer = await createAssetObjectWriter(
    { mimeType: 'application/octet-stream' },
    assetOptions
  );
  try {
    await stream.pipeTo(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          args.signal?.throwIfAborted();
          const copy = new Uint8Array(chunk);
          await writer.append(new Blob([copy.buffer]));
        },
      }),
      args.signal
    );
    args.signal?.throwIfAborted();
    const prepared = await writer.finalize();
    args.signal?.throwIfAborted();
    if (prepared.ref.size !== stream.size) throw new RecordingEventsError('integrity');
    const file = await readAssetFile(prepared.ref, 'events.bin', assetOptions);
    const digest = sha256.create();
    await file.stream().pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          args.signal?.throwIfAborted();
          digest.update(chunk);
        },
      }),
      args.signal ? { signal: args.signal } : {}
    );
    const actual = Array.from(digest.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    );
    if (actual !== stream.source.descriptor.streamSha256)
      throw new RecordingEventsError('integrity');
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
      ref: { ...prepared.ref, sha256: actual },
      writer: { ...identity, writerGeneration: stream.writerGeneration },
      ...stream.source,
    };
  } catch (error) {
    try {
      await writer.abort();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Event snapshot preparation and cleanup failed.', {
        cause: cleanup,
      });
    }
    throw error;
  }
}
