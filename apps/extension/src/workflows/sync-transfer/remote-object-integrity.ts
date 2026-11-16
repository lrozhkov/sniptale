import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import type { SyncRemoteStore } from './remote-store';

export class RemoteContentMismatch extends Error {}

/** Download small metadata with a byte limit before allocation and integrity before installation. */
export async function readVerifiedRemoteObjectBlob(
  remote: SyncRemoteStore,
  key: string,
  expected: { size: number; sha256: string; mimeType: string; maxBytes: number },
  signal: AbortSignal
): Promise<Blob> {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(expected.size) ||
    expected.size < 0 ||
    expected.size > expected.maxBytes
  )
    throw new RemoteContentMismatch();
  const stream = await remote.read(key, signal);
  let bytes = 0;
  const checked = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (!Number.isSafeInteger(bytes) || bytes > expected.size)
          throw new RemoteContentMismatch();
        controller.enqueue(chunk);
      },
      flush() {
        if (bytes !== expected.size) throw new RemoteContentMismatch();
      },
    }),
    { signal }
  );
  const blob = await new Response(checked).blob();
  const digest = await digestBackupObject(
    {
      size: blob.size,
      pipeTo: (sink) => blob.stream().pipeTo(sink, { signal }),
    },
    signal
  );
  if (digest !== expected.sha256) throw new RemoteContentMismatch();
  return blob.slice(0, blob.size, expected.mimeType);
}

export async function verifyRemoteObject(
  remote: SyncRemoteStore,
  key: string,
  size: number,
  sha256: string,
  signal: AbortSignal
) {
  const stream = await remote.read(key, signal);
  let bytes = 0;
  const checked = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (!Number.isSafeInteger(bytes) || bytes > size) throw new RemoteContentMismatch();
        controller.enqueue(chunk);
      },
      flush() {
        if (bytes !== size) throw new RemoteContentMismatch();
      },
    })
  );
  const actual = await digestBackupObject(
    { size, pipeTo: (sink) => checked.pipeTo(sink, { signal }) },
    signal
  );
  if (actual !== sha256) throw new RemoteContentMismatch();
}
