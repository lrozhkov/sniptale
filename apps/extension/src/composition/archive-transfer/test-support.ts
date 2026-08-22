import type { ExportSink } from './contracts';

const DEFAULT_MEMORY_SINK_BYTES = 64 * 1024 * 1024;

export function createArchiveMemorySink(maxBytes = DEFAULT_MEMORY_SINK_BYTES) {
  const chunks: ArrayBuffer[] = [];
  let aborted = false;
  let bytesWritten = 0;
  const sink: ExportSink = {
    writable: new WritableStream({
      write(chunk: Uint8Array) {
        if (bytesWritten + chunk.byteLength > maxBytes) {
          throw new Error('Archive memory sink exceeds its byte budget.');
        }
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        chunks.push(copy.buffer);
        bytesWritten += chunk.byteLength;
      },
    }),
    close: async () => undefined,
    abort: async () => {
      aborted = true;
    },
  };
  return {
    sink,
    get aborted() {
      return aborted;
    },
    blob: () => new Blob(chunks, { type: 'application/zip' }),
    bytes: () => {
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
  };
}
