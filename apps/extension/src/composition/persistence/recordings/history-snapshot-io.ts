import { sha256 } from '@noble/hashes/sha2.js';
import type { AssetRef } from '../assets/contracts';
import {
  createAssetObjectWriter,
  readAssetFile,
  type AssetOpfsOptions,
} from '../assets/opfs-store';

interface HistorySource {
  size: number;
  pipeTo(target: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
}

/** Copies a complete framed source before the caller finalizes its private stream. */
export async function stageHistorySnapshot(args: {
  source: HistorySource;
  sink: WritableStream<Uint8Array>;
  signal: AbortSignal | undefined;
  integrityError(): Error;
  finalize(): Promise<void>;
  retire(): Promise<void>;
  cleanupMessage: string;
}): Promise<void> {
  const sinkWriter = args.sink.getWriter();
  let closed = false;
  let received = 0;
  try {
    await args.source.pipeTo(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          args.signal?.throwIfAborted();
          received += chunk.byteLength;
          if (!Number.isSafeInteger(received) || received > args.source.size)
            throw args.integrityError();
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
    if (!closed || received !== args.source.size) throw args.integrityError();
    await args.finalize();
  } catch (error) {
    await sinkWriter.abort(error).catch(() => undefined);
    try {
      await args.retire();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], args.cleanupMessage, { cause: cleanup });
    }
    throw error;
  } finally {
    sinkWriter.releaseLock();
  }
}

/** Verifies actual immutable bytes and keeps cleanup ownership through the final source check. */
export async function prepareHistorySnapshot<T>(args: {
  stream: HistorySource;
  expectedSha256: string;
  filename: string;
  signal: AbortSignal | undefined;
  assetOptions: AssetOpfsOptions;
  integrityError(): Error;
  cleanupMessage: string;
  admit(ref: AssetRef, actualSha256: string): Promise<T>;
}): Promise<T> {
  const writer = await createAssetObjectWriter(
    { mimeType: 'application/octet-stream' },
    args.assetOptions
  );
  try {
    await args.stream.pipeTo(
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
    if (prepared.ref.size !== args.stream.size) throw args.integrityError();
    const file = await readAssetFile(prepared.ref, args.filename, args.assetOptions);
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
    if (actual !== args.expectedSha256) throw args.integrityError();
    return await args.admit(prepared.ref, actual);
  } catch (error) {
    try {
      await writer.abort();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], args.cleanupMessage, { cause: cleanup });
    }
    throw error;
  }
}
