import { BlobReader, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { ArchiveEntrySource, ArchiveWriter, ExportSink } from './contracts';
import { assertSafeArchivePath } from './path';
import { admitArchiveEntry, createArchiveBudget, assertArchiveTextSize } from './profile';
import { createArchiveOutputBoundary } from './output';

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException('Media archive operation was cancelled.', 'AbortError');
}

function createSourceTransfer(
  source: ArchiveEntrySource,
  signal: AbortSignal | undefined
): {
  cleanup(): void;
  readable: ReadableStream<Uint8Array>;
  signal: AbortSignal;
  transfer: Promise<void>;
  cancel(reason: unknown): void;
} {
  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  let bytesRead = 0;
  const boundary = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, streamController) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('Media archive source emitted a non-binary chunk.');
      }
      bytesRead += chunk.byteLength;
      if (bytesRead > source.size) {
        throw new Error('Media archive source exceeded its declared size.');
      }
      streamController.enqueue(chunk);
    },
    flush() {
      if (bytesRead !== source.size) {
        throw new Error('Media archive source did not match its declared size.');
      }
    },
  });
  return {
    cleanup() {
      signal?.removeEventListener('abort', abortFromCaller);
    },
    readable: boundary.readable,
    signal: controller.signal,
    transfer: source.pipeTo(boundary.writable, controller.signal),
    cancel(reason) {
      controller.abort(reason);
    },
  };
}

export function createArchiveWriter(
  sink: ExportSink,
  options: { onBytesWritten?: (bytesWritten: number) => void } = {}
): ArchiveWriter {
  const output = createArchiveOutputBoundary(sink.writable, undefined, options.onBytesWritten);
  const zip = new ZipWriter(output.writable, {
    bufferedWrite: false,
    preventClose: true,
    useWebWorkers: false,
    zip64: true,
  });
  const budget = createArchiveBudget();
  const paths = new Set<string>();
  const canonicalPaths = new Set<string>();
  let settled = false;

  const admit = (path: string, size: number) => {
    if (settled) throw new Error('Media archive writer is already settled.');
    assertSafeArchivePath(path);
    const canonicalPath = path.toLocaleLowerCase('en-US');
    if (paths.has(path) || canonicalPaths.has(canonicalPath)) {
      throw new Error(`Duplicate media archive path: ${path}.`);
    }
    admitArchiveEntry(budget, size);
    paths.add(path);
    canonicalPaths.add(canonicalPath);
  };

  return {
    async addBlob(path, blob, options = {}) {
      assertNotAborted(options.signal);
      admit(path, blob.size);
      await zip.add(path, new BlobReader(blob), {
        bufferedWrite: false,
        level: options.compress ? 6 : 0,
        ...(options.signal ? { signal: options.signal } : {}),
        useWebWorkers: false,
        zip64: true,
      });
      assertNotAborted(options.signal);
    },
    async addSource(path, source, options = {}) {
      assertNotAborted(options.signal);
      if (source.directory) {
        throw new Error('Media archive directory sources are not supported.');
      }
      admit(path, source.size);
      const transfer = createSourceTransfer(source, options.signal);
      const archiveEntry = zip.add(path, transfer.readable, {
        bufferedWrite: false,
        level: options.compress ? 6 : 0,
        signal: transfer.signal,
        useWebWorkers: false,
        zip64: true,
      });
      try {
        const [metadata] = await Promise.all([archiveEntry, transfer.transfer]);
        if (metadata.uncompressedSize !== source.size) {
          throw new Error('Media archive entry did not match its declared source size.');
        }
        assertNotAborted(options.signal);
      } catch (error) {
        transfer.cancel(error);
        await Promise.allSettled([archiveEntry, transfer.transfer]);
        throw error;
      } finally {
        transfer.cleanup();
      }
    },
    async addText(path, value, options = {}) {
      assertNotAborted(options.signal);
      const size = new TextEncoder().encode(value).byteLength;
      assertArchiveTextSize(size);
      admit(path, size);
      await zip.add(path, new TextReader(value), {
        bufferedWrite: false,
        level: 6,
        ...(options.signal ? { signal: options.signal } : {}),
        useWebWorkers: false,
        zip64: true,
      });
      assertNotAborted(options.signal);
    },
    async close() {
      if (settled) throw new Error('Media archive writer is already settled.');
      settled = true;
      try {
        await zip.close(undefined, { preventClose: true, zip64: true });
        output.release();
        await sink.close();
      } catch (error) {
        output.release();
        let abortError: unknown;
        try {
          await sink.abort(error);
        } catch (caughtError) {
          abortError = caughtError;
        }
        if (abortError !== undefined) {
          throw new AggregateError(
            [error, abortError],
            'Media archive close failed and output cleanup was incomplete.',
            { cause: error }
          );
        }
        throw error;
      }
    },
    async abort(reason) {
      if (settled) return;
      settled = true;
      output.release();
      let abortError: unknown;
      try {
        await sink.abort(reason);
      } catch (caughtError) {
        abortError = caughtError;
      }
      if (abortError !== undefined) {
        if (reason === undefined) throw abortError;
        throw new AggregateError(
          [reason, abortError],
          'Media archive operation failed and output cleanup was incomplete.',
          { cause: reason }
        );
      }
    },
  };
}
