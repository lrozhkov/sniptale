import { StreamTarget, type StreamTargetChunk } from 'mediabunny';
import type { RecordingStagingArtifactWriter } from '../../../composition/persistence/recordings/staging';

/** Groups encoded packets before the existing durable, append-only staging boundary. */
export function createLiveOutputTarget(
  writer: Pick<RecordingStagingArtifactWriter, 'append'>
): StreamTarget {
  let nextPosition = 0;
  return new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        if (chunk.position !== nextPosition) {
          throw new Error('Live recording output must append contiguous bytes.');
        }
        await writer.append(
          new Blob([new Uint8Array(chunk.data).buffer], { type: 'application/octet-stream' })
        );
        nextPosition += chunk.data.byteLength;
      },
    }),
    { chunked: true, chunkSize: 64 * 1024 }
  );
}
