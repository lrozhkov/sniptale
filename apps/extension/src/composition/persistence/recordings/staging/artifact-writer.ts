import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingArtifactInput,
  RecordingStagingArtifactWriter,
  RecordingStagingStorageArtifact,
} from './contracts';

type ArtifactPhase = 'open' | 'finalizing' | 'finalized' | 'aborted';

export interface RecordingStagingArtifactOwner {
  readonly phase: ArtifactPhase;
  readonly writer: RecordingStagingArtifactWriter;
  abort(): Promise<void>;
}

interface CreateRecordingStagingArtifactOwnerInput {
  assertCoordinatorHealthy(): void;
  input: RecordingStagingArtifactInput;
  recordFailure(error: unknown): void;
  releasePendingBytes(size: number): void;
  reservePendingBytes(size: number): void;
  storage: RecordingStagingStorageArtifact;
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
      if (phase === 'finalized' || phase === 'aborted') return;
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

      const operation = tail.then(() => input.storage.append(chunk));
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
          await input.storage.close();
          const sourceFile = await input.storage.getFile();
          const file = new File([sourceFile], input.input.filename, {
            lastModified: sourceFile.lastModified,
            type: input.input.mimeType,
          });
          phase = 'finalized';
          return {
            artifactId: input.input.artifactId,
            file,
            filename: input.input.filename,
            mimeType: input.input.mimeType,
            size: file.size,
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
  };
}
