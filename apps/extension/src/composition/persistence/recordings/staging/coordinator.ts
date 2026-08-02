// policyStateId: persistent-data-erasure-lease
// The active staging registry is an erasure participant, not a caller capability.
import {
  RECORDING_STAGING_PENDING_BYTES_LIMIT,
  type RecordingStagingCoordinator,
  type RecordingStagingStorageAdapter,
} from './contracts';
import { createOpfsRecordingStagingStorage } from './opfs-adapter';
import {
  createRecordingStagingArtifactOwner,
  type RecordingStagingArtifactOwner,
} from './artifact-writer';

type CoordinatorPhase = 'active' | 'aborting' | 'aborted' | 'deleting' | 'deleted';

export interface CreateRecordingStagingCoordinatorOptions {
  pendingBytesLimit?: number;
  storage?: RecordingStagingStorageAdapter;
}

let stagingGeneration = 0;
const activeCoordinators = new Set<RecordingStagingCoordinator>();

export async function invalidateAndAbortActiveRecordingStaging(): Promise<void> {
  stagingGeneration += 1;
  const results = await Promise.allSettled(
    [...activeCoordinators].map((coordinator) => coordinator.abort())
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to invalidate active recording staging.');
  }
}

function requireNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Recording staging ${fieldName} must not be empty.`);
  }
}

function createPendingBytesOverflowError(limit: number): Error {
  return new Error(`Recording staging pending-byte limit exceeded (${limit} bytes).`);
}

export async function createRecordingStagingCoordinator(
  options: CreateRecordingStagingCoordinatorOptions = {}
): Promise<RecordingStagingCoordinator> {
  const generation = stagingGeneration;
  const storage = options.storage ?? createOpfsRecordingStagingStorage();
  const pendingBytesLimit = options.pendingBytesLimit ?? RECORDING_STAGING_PENDING_BYTES_LIMIT;
  if (!Number.isSafeInteger(pendingBytesLimit) || pendingBytesLimit <= 0) {
    throw new Error('Recording staging pending-byte limit must be a positive safe integer.');
  }

  const session = await storage.createSession();
  if (generation !== stagingGeneration) {
    await session.remove();
    throw new Error('Recording staging was invalidated during session creation.');
  }
  const artifacts = new Map<string, RecordingStagingArtifactOwner>();
  let pendingBytes = 0;
  let failure: unknown = null;
  let phase: CoordinatorPhase = 'active';
  let abortPromise: Promise<void> | null = null;
  let deletePromise: Promise<void> | null = null;

  const requireHealthy = () => {
    if (generation !== stagingGeneration) {
      throw new Error('Recording staging coordinator generation is stale.');
    }
    if (failure !== null) throw failure;
    if (phase !== 'active') throw new Error(`Recording staging coordinator is ${phase}.`);
  };

  const recordFailure = (error: unknown) => {
    failure ??= error;
  };

  const reservePendingBytes = (size: number) => {
    requireHealthy();
    if (pendingBytes + size > pendingBytesLimit) {
      const error = createPendingBytesOverflowError(pendingBytesLimit);
      recordFailure(error);
      throw error;
    }
    pendingBytes += size;
  };

  const releasePendingBytes = (size: number) => {
    pendingBytes -= size;
  };

  const coordinator: RecordingStagingCoordinator = {
    getPendingBytes: () => pendingBytes,
    async openArtifact(input) {
      requireHealthy();
      requireNonEmpty(input.artifactId, 'artifact ID');
      requireNonEmpty(input.filename, 'filename');
      requireNonEmpty(input.mimeType, 'MIME type');
      if (artifacts.has(input.artifactId)) {
        throw new Error(`Recording staging artifact already exists: ${input.artifactId}.`);
      }

      try {
        const artifactStorage = await session.createArtifact();
        try {
          requireHealthy();
        } catch (error) {
          try {
            await artifactStorage.abort();
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              'Recording staging became unavailable while an artifact was opening.'
            );
          }
          throw error;
        }
        const owner = createRecordingStagingArtifactOwner({
          assertCoordinatorHealthy: requireHealthy,
          input,
          recordFailure,
          releasePendingBytes,
          reservePendingBytes,
          storage: artifactStorage,
        });
        artifacts.set(input.artifactId, owner);
        return owner.writer;
      } catch (error) {
        recordFailure(error);
        throw error;
      }
    },
    abort() {
      abortPromise ??= (async () => {
        if (phase === 'aborted' || phase === 'deleted') return;
        phase = 'aborting';
        const cleanupResults = await Promise.allSettled(
          [...artifacts.values()].map((artifact) => artifact.abort())
        );
        const cleanupErrors: unknown[] = [];
        cleanupResults.forEach((result) => {
          if (result.status === 'rejected') {
            const reason: unknown = result.reason;
            cleanupErrors.push(reason);
          }
        });
        try {
          await session.remove();
        } catch (error) {
          cleanupErrors.push(error);
        }
        phase = 'aborted';
        activeCoordinators.delete(coordinator);
        if (cleanupErrors.length > 0) {
          throw new AggregateError(cleanupErrors, 'Failed to abort recording staging.');
        }
      })();
      return abortPromise;
    },
    delete() {
      deletePromise ??= (async () => {
        requireHealthy();
        const unfinished = [...artifacts.values()].some(
          (artifact) => artifact.phase !== 'finalized'
        );
        if (unfinished) {
          throw new Error('Cannot delete recording staging before all artifacts are finalized.');
        }
        phase = 'deleting';
        await session.remove();
        phase = 'deleted';
        activeCoordinators.delete(coordinator);
      })();
      return deletePromise;
    },
  };
  activeCoordinators.add(coordinator);
  return coordinator;
}
