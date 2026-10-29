import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import type { SyncRemoteStore } from './remote-store';

export class RemoteContentMismatch extends Error {}

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
