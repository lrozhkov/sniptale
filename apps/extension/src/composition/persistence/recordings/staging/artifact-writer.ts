import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingArtifactInput,
  RecordingStagingArtifactWriter,
} from './contracts';
import {
  isAssetReadyProtected,
  releaseAssetReadyProtection,
  type AssetObjectWriter,
} from '../../assets';

type ArtifactPhase = 'open' | 'finalizing' | 'finalized' | 'aborted';

export interface RecordingStagingArtifactOwner {
  readonly phase: ArtifactPhase;
  readonly writer: RecordingStagingArtifactWriter;
  abort(): Promise<void>;
  release(): Promise<void>;
}

interface CreateRecordingStagingArtifactOwnerInput {
  admitBytes(size: number): Promise<void>;
  assertCoordinatorHealthy(): void;
  input: RecordingStagingArtifactInput;
  recordFailure(error: unknown): void;
  releasePendingBytes(size: number): void;
  reservePendingBytes(size: number): void;
  storage: AssetObjectWriter;
}

export function createRecordingStagingArtifactOwner(
  input: CreateRecordingStagingArtifactOwnerInput
): RecordingStagingArtifactOwner {
  let abortPromise: Promise<void> | null = null;
  let finalizePromise: Promise<FinalizedRecordingStagingArtifact> | null = null;
  let phase: ArtifactPhase = 'open';
  let tail = Promise.resolve();

  const abort = () => {
    abortPromise ??= (async () => {
      if (phase === 'aborted') return;
      if (phase === 'finalized' && isAssetReadyProtected(input.storage.assetId)) return;
      phase = 'aborted';
      await tail.catch(() => undefined);
      await input.storage.abort();
    })();
    return abortPromise;
  };

  const writer: RecordingStagingArtifactWriter = {
    append(chunk) {
      if (phase !== 'open') {
        return Promise.reject(new Error(`Recording staging artifact is ${phase}.`));
      }
      try {
        input.reservePendingBytes(chunk.size);
      } catch (error) {
        return Promise.reject(error);
      }

      const operation = tail.then(async () => {
        await input.admitBytes(chunk.size);
        await input.storage.append(chunk);
      });
      tail = operation.then(
        () => input.releasePendingBytes(chunk.size),
        (error: unknown) => {
          input.releasePendingBytes(chunk.size);
          input.recordFailure(error);
          throw error;
        }
      );
      return tail;
    },
    abort,
    finalize() {
      finalizePromise ??= (async () => {
        input.assertCoordinatorHealthy();
        if (phase !== 'open') {
          throw new Error(`Recording staging artifact is ${phase}.`);
        }
        phase = 'finalizing';
        try {
          await tail;
          input.assertCoordinatorHealthy();
          const prepared = await input.storage.finalize();
          phase = 'finalized';
          return {
            artifactId: input.input.artifactId,
            asset: prepared,
            filename: input.input.filename,
            mimeType: input.input.mimeType,
            size: prepared.ref.size,
          };
        } catch (error) {
          input.recordFailure(error);
          throw error;
        }
      })();
      return finalizePromise;
    },
  };

  return {
    get phase() {
      return phase;
    },
    writer,
    abort,
    release: () => releaseAssetReadyProtection([input.storage.assetId]),
  };
}
