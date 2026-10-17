// policyStateId: persistent-data-erasure-lease
// The active staging registry is an erasure participant, not a caller capability.
import {
  RECORDING_STAGING_PENDING_BYTES_LIMIT,
  type RecordingStagingCoordinator,
  type RecordingStagingArtifactInput,
} from './contracts';
import { assertAssetWriteAdmission, type AssetObjectWriter } from '../../assets';
import { initializeRecoveryEpoch } from '../recovery/storage';
import { createDurableRecordingWriter } from './durable-writer';
import { initDB } from '../../infrastructure/indexed-db/core';
import {
  createRecordingStagingArtifactOwner,
  type RecordingStagingArtifactOwner,
} from './artifact-writer';

type CoordinatorPhase = 'active' | 'aborting' | 'aborted' | 'deleting' | 'deleted';

export interface CreateRecordingStagingCoordinatorOptions {
  admitBytes?: (size: number) => Promise<void>;
  createWriter?: (input: { assetId?: string; mimeType: string }) => Promise<AssetObjectWriter>;
  pendingBytesLimit?: number;
}

let stagingGeneration = 0;
const activeCoordinators = new Map<RecordingStagingCoordinator, () => Promise<void>>();

export async function invalidateAndAbortActiveRecordingStaging(): Promise<void> {
  stagingGeneration += 1;
  const results = await Promise.allSettled(
    [...activeCoordinators.values()].map((invalidate) => invalidate())
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

function createRecordingPendingByteBudget(
  limit: number,
  requireHealthy: () => void,
  recordFailure: (error: unknown) => void
) {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Recording staging pending-byte limit must be a positive safe integer.');
  }
  let pendingBytes = 0;
  return {
    getPendingBytes: () => pendingBytes,
    reserve(size: number) {
      requireHealthy();
      if (pendingBytes + size > limit) {
        const error = new Error(`Recording staging pending-byte limit exceeded (${limit} bytes).`);
        recordFailure(error);
        throw error;
      }
      pendingBytes += size;
    },
    release(size: number) {
      pendingBytes -= size;
    },
  };
}

async function settleArtifactCleanup(
  artifacts: Iterable<RecordingStagingArtifactOwner>,
  action: 'abort' | 'release' | 'invalidate',
  message: string
): Promise<void> {
  const results = await Promise.allSettled([...artifacts].map((artifact) => artifact[action]()));
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length) throw new AggregateError(failures, message);
}

async function acquireArtifactStorage(
  input: RecordingStagingArtifactInput,
  epoch: string | null,
  createWriter: CreateRecordingStagingCoordinatorOptions['createWriter'],
  requireHealthy: () => void
): Promise<AssetObjectWriter> {
  const storage = createWriter
    ? await createWriter({ mimeType: input.mimeType })
    : await createDurableRecordingWriter(input, epoch!);
  try {
    requireHealthy();
    return storage;
  } catch (error) {
    try {
      await storage.abort();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Recording staging became unavailable while an artifact was opening.',
        { cause: cleanupError }
      );
    }
    throw error;
  }
}

export async function createRecordingStagingCoordinator(
  options: CreateRecordingStagingCoordinatorOptions = {}
): Promise<RecordingStagingCoordinator> {
  // Cold database admission reserves the exclusive transition gate; it must settle
  // before artifact writers hold shared transition leases or publication admission
  // can deadlock against this context's own leases.
  await initDB();
  const generation = stagingGeneration;
  const createWriter = options.createWriter;
  const admitBytes = options.admitBytes ?? assertAssetWriteAdmission;
  const budget = createRecordingPendingByteBudget(
    options.pendingBytesLimit ?? RECORDING_STAGING_PENDING_BYTES_LIMIT,
    () => requireHealthy(),
    (error) => recordFailure(error)
  );
  const epoch = options.createWriter ? null : await initializeRecoveryEpoch();

  const artifacts = new Map<string, RecordingStagingArtifactOwner>();
  let failure: unknown = null;
  let phase: CoordinatorPhase = 'active';
  let abortPromise: Promise<void> | null = null;
  let deletePromise: Promise<void> | null = null;

  const requireGeneration = () => {
    if (generation !== stagingGeneration) {
      throw new Error('Recording staging coordinator generation is stale.');
    }
  };

  const requireHealthy = () => {
    requireGeneration();
    if (failure !== null) throw failure;
    if (phase !== 'active') throw new Error(`Recording staging coordinator is ${phase}.`);
  };

  const recordFailure = (error: unknown) => {
    failure ??= error;
  };

  const coordinator: RecordingStagingCoordinator = {
    getPendingBytes: budget.getPendingBytes,
    async openArtifact(input) {
      requireHealthy();
      requireNonEmpty(input.artifactId, 'artifact ID');
      requireNonEmpty(input.filename, 'filename');
      requireNonEmpty(input.mimeType, 'MIME type');
      if (artifacts.has(input.artifactId)) {
        throw new Error(`Recording staging artifact already exists: ${input.artifactId}.`);
      }

      try {
        await admitBytes(0);
        const artifactStorage = await acquireArtifactStorage(
          input,
          epoch,
          createWriter,
          requireHealthy
        );
        const owner = createRecordingStagingArtifactOwner({
          admitBytes,
          assertCoordinatorHealthy: requireHealthy,
          assertCoordinatorGeneration: requireGeneration,
          input,
          recordFailure,
          releasePendingBytes: budget.release,
          reservePendingBytes: budget.reserve,
          storage: artifactStorage,
        });
        artifacts.set(input.artifactId, owner);
        return owner.writer;
      } catch (error) {
        recordFailure(error);
        throw error;
      }
    },
    async discard() {
      await coordinator.abort();
      await Promise.all([...artifacts.values()].map((artifact) => artifact.discard()));
    },
    abort() {
      abortPromise ??= (async () => {
        if (phase === 'aborted' || phase === 'deleted') return;
        phase = 'aborting';
        try {
          await settleArtifactCleanup(
            artifacts.values(),
            'abort',
            'Failed to abort recording staging.'
          );
        } finally {
          phase = 'aborted';
          activeCoordinators.delete(coordinator);
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
        try {
          await settleArtifactCleanup(
            artifacts.values(),
            'release',
            'Failed to release recording staging.'
          );
        } finally {
          phase = 'deleted';
          activeCoordinators.delete(coordinator);
        }
      })();
      return deletePromise;
    },
  };
  activeCoordinators.set(coordinator, async () => {
    phase = 'aborted';
    activeCoordinators.delete(coordinator);
    await settleArtifactCleanup(
      artifacts.values(),
      'invalidate',
      'Failed to release invalidated recording staging.'
    );
  });
  return coordinator;
}
