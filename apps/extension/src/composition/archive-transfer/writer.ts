import { BlobReader, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { ArchiveWriter, ExportSink } from './contracts';
import { assertSafeArchivePath } from './path';
import { admitArchiveEntry, createArchiveBudget, assertArchiveTextSize } from './profile';
import { createArchiveOutputBoundary } from './output';

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException('Media archive operation was cancelled.', 'AbortError');
}

export function createArchiveWriter(sink: ExportSink): ArchiveWriter {
  const output = createArchiveOutputBoundary(sink.writable);
  const zip = new ZipWriter(output.writable, {
    bufferedWrite: false,
    preventClose: true,
    useWebWorkers: false,
    zip64: true,
  });
  const budget = createArchiveBudget();
  const paths = new Set<string>();
  let settled = false;

  const admit = (path: string, size: number) => {
    if (settled) throw new Error('Media archive writer is already settled.');
    assertSafeArchivePath(path);
    if (paths.has(path)) throw new Error(`Duplicate media archive path: ${path}.`);
    admitArchiveEntry(budget, size);
    paths.add(path);
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
