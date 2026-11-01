import type { ArchiveStreamSource } from '../../../composition/archive-transfer';
import type { ArchiveRootObjectSource } from './contracts';

/** Opens one bounded stream. Callers own transfer, cancellation and publication. */
export async function openArchiveRootObjectSource(
  source: ArchiveRootObjectSource,
  signal?: AbortSignal
): Promise<ArchiveStreamSource> {
  signal?.throwIfAborted();
  const blob = source.blob;
  const stream: ArchiveStreamSource = blob
    ? {
        size: blob.size,
        pipeTo: (sink: WritableStream<Uint8Array>, abort?: AbortSignal) =>
          blob.stream().pipeTo(sink, abort ? { signal: abort } : {}),
      }
    : await source.open(signal);
  signal?.throwIfAborted();
  if (stream.directory || stream.size !== source.ref.size)
    throw new Error('Media backup object source size changed.');
  return stream;
}
