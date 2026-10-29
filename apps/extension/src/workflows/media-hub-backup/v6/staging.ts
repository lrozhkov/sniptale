import { sha256 } from '@noble/hashes/sha2.js';
import {
  assertAssetWriteAdmission,
  createAssetObjectWriter,
  discardPreparedAsset,
  type PreparedAssetObject,
} from '../../../composition/persistence/assets';
import type { PersistenceMutationTransitionPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import type { ArchiveEntrySource, ArchiveReader } from '../../../composition/archive-transfer';
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
  return stageRootObjects({
    objects: args.envelope.objects,
    ...(args.onBytesRead ? { onBytesRead: args.onBytesRead } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.transitionPermit ? { transitionPermit: args.transitionPermit } : {}),
    async readObject(object) {
      const entry = args.reader.entry(object.path);
      if (!entry) throw new Error(`Media backup object is missing: ${object.path}.`);
      if (entry.size !== object.size) {
        throw new Error(`Media backup object size does not match: ${object.path}.`);
      }
      return entry;
    },
  });
}

/** Stage a validated selection. The caller keeps protection until its ready journal claims the files. */
export async function stageRootObjects(args: {
  objects: readonly MediaHubBackupRootEnvelope['objects'][number][];
  readObject: (
    object: MediaHubBackupRootEnvelope['objects'][number]
  ) => Promise<Pick<ArchiveEntrySource, 'pipeTo'>>;
  expectedSha256?: ReadonlyMap<string, string>;
  onBytesRead?: (bytes: number, filename: string) => void;
  signal?: AbortSignal;
  transitionPermit?: PersistenceMutationTransitionPermit;
}): Promise<StagedArchiveObject[]> {
  const objects = args.objects.map((object) => ({ ...object }));
  const expectedSha256 = args.expectedSha256 ? new Map(args.expectedSha256) : undefined;
  if (
    expectedSha256 &&
    (expectedSha256.size !== objects.length ||
      objects.some((object) => !/^[a-f0-9]{64}$/u.test(expectedSha256.get(object.objectId) ?? '')))
  ) {
    throw new Error('Root object checksum table is invalid.');
  }
  const totalBytes = objects.reduce((total, object) => total + object.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new Error('Root object size is invalid.');
  }
  await assertAssetWriteAdmission(totalBytes);
  const staged: StagedArchiveObject[] = [];
  try {
    for (const object of objects) {
      if (args.signal?.aborted) {
        throw new DOMException('Media backup restore was cancelled.', 'AbortError');
      }
      const entry = await args.readObject(object);
      const digest = expectedSha256 ? sha256.create() : undefined;
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
              digest?.update(copy);
              await writer.append(new Blob([copy.buffer], { type: object.mimeType }));
              args.onBytesRead?.(chunk.byteLength, object.filename);
            },
          }),
          args.signal
        );
        if (written !== object.size) {
          throw new Error(`Media backup object size does not match: ${object.path}.`);
        }
        if (digest) {
          const actual = Array.from(digest.digest(), (byte) =>
            byte.toString(16).padStart(2, '0')
          ).join('');
          if (actual !== expectedSha256?.get(object.objectId)) {
            throw new Error('Root object checksum does not match.');
          }
        }
        if (args.signal?.aborted) {
          throw new DOMException('Media backup restore was cancelled.', 'AbortError');
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
