import { MAX_MEDIA_ARCHIVE_BYTES } from './contracts';

export function createArchiveOutputBoundary(
  destination: WritableStream<Uint8Array>,
  maxBytes = MAX_MEDIA_ARCHIVE_BYTES
): { release(): void; writable: WritableStream<Uint8Array> } {
  const writer = destination.getWriter();
  let bytesWritten = 0;
  let released = false;

  return {
    release() {
      if (released) return;
      released = true;
      writer.releaseLock();
    },
    writable: new WritableStream({
      async write(chunk) {
        const nextBytesWritten = bytesWritten + chunk.byteLength;
        if (!Number.isSafeInteger(nextBytesWritten) || nextBytesWritten > maxBytes) {
          throw new Error('Media archive exceeds its compressed byte budget.');
        }
        await writer.write(chunk);
        bytesWritten = nextBytesWritten;
      },
    }),
  };
}
