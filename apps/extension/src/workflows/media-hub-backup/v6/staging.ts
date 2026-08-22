import {
  assertAssetWriteAdmission,
  createAssetObjectWriter,
  discardPreparedAsset,
  type PreparedAssetObject,
} from '../../../composition/persistence/assets';
import type { PersistenceMutationTransitionPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import type { ArchiveReader } from '../../../composition/archive-transfer';
import type { MediaHubBackupRootEnvelope } from './contracts';

export interface StagedArchiveObject extends PreparedAssetObject {
  objectId: string;
}

export async function stageArchiveRootObjects(args: {
  envelope: MediaHubBackupRootEnvelope;
  onBytesRead?: (bytes: number, filename: string) => void;
  reader: ArchiveReader;
  signal?: AbortSignal;
  transitionPermit?: PersistenceMutationTransitionPermit;
}): Promise<StagedArchiveObject[]> {
  await assertAssetWriteAdmission(args.envelope.descriptor.totalBytes);
  const staged: StagedArchiveObject[] = [];
  try {
    for (const object of args.envelope.objects) {
      if (args.signal?.aborted) {
        throw new DOMException('Media backup restore was cancelled.', 'AbortError');
      }
      const entry = args.reader.entry(object.path);
      if (!entry) throw new Error(`Media backup object is missing: ${object.path}.`);
      if (entry.size !== object.size) {
        throw new Error(`Media backup object size does not match: ${object.path}.`);
      }
      const writer = await createAssetObjectWriter(
        { mimeType: object.mimeType },
        args.transitionPermit ? { persistenceTransitionPermit: args.transitionPermit } : {}
      );
      let written = 0;
      try {
        await entry.pipeTo(
          new WritableStream<Uint8Array>({
            async write(chunk) {
              written += chunk.byteLength;
              if (written > object.size) {
                throw new Error(`Media backup object exceeds its declared size: ${object.path}.`);
              }
              const copy = new Uint8Array(chunk.byteLength);
              copy.set(chunk);
              await writer.append(new Blob([copy.buffer], { type: object.mimeType }));
              args.onBytesRead?.(chunk.byteLength, object.filename);
            },
          }),
          args.signal
        );
        if (written !== object.size) {
          throw new Error(`Media backup object size does not match: ${object.path}.`);
        }
        staged.push({ ...(await writer.finalize()), objectId: object.objectId });
      } catch (error) {
        await writer.abort().catch((cleanupError: unknown) => {
          throw new AggregateError(
            [error, cleanupError],
            'Media backup object staging cleanup failed.',
            { cause: error }
          );
        });
        throw error;
      }
    }
    return staged;
  } catch (error) {
    const cleanup = await Promise.allSettled(
      staged.map((object) => discardPreparedAsset(object.ref.assetId))
    );
    const failures = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (failures.length > 0) {
      throw new AggregateError([error, ...failures], 'Media backup root staging cleanup failed.', {
        cause: error,
      });
    }
    throw error;
  }
}
