import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingsBatchWithCompletionSafely } from '../../workflows/media-hub/store';
import { loadSettings } from '../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../composition/persistence/library-lifecycle';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { beginRecordingFinalization, finishRecordingFinalization } from './finalization-replay';
import { persistStaticFrameSignals } from './signals/static-frame';
import { resolveVideoRecordingArtifact } from '../../platform/media-utils/video-recording';
import { stageAndPublishPostRecordResult } from './post-record-publication';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingCoordinator,
} from '../../composition/persistence/recordings/staging';

const logger = createLogger({ namespace: 'OffscreenRecordingFinalize' });

type FinalizeResult = {
  filename: string;
  recordingId: string;
};

type FinalizeRecordingOptions = {
  notifySaved?: boolean;
  notifyStopped?: boolean;
};

interface FinalizeRecordingInput {
  artifacts: readonly FinalizedRecordingStagingArtifact[];
  discard: boolean;
  options?: FinalizeRecordingOptions;
  primaryRecordingId: string;
  staging: RecordingStagingCoordinator | null;
}

function buildTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

export function buildRecordingFilename(mimeType: string): string {
  const { extension } = resolveVideoRecordingArtifact(mimeType);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${buildTimestamp()}.${extension}`;
}

export function buildSidecarFilename(filenameSuffix: string, mimeType: string): string {
  const { extension } = resolveVideoRecordingArtifact(mimeType);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${buildTimestamp()}-${filenameSuffix}.${extension}`;
}

function stringifyFinalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notifyRecordingStoppedBestEffort(reason: string, recordingId: string): void {
  void sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId,
  }).catch((error) => {
    logger.debug('Failed to notify runtime that recording stopped', {
      errorMessage: stringifyFinalizeError(error),
      reason,
      recordingId,
    });
  });
}

function createPostRecordResult(recordingId: string) {
  return {
    primaryRecordingId: recordingId,
    projectId: null,
    recordingId,
  } as const;
}

function publishVideoSavedToIdb(recordingId: string): Promise<void> {
  return stageAndPublishPostRecordResult(createPostRecordResult(recordingId), {
    sendRuntimeMessage,
  });
}

function validateArtifacts(input: FinalizeRecordingInput): FinalizedRecordingStagingArtifact {
  if (!input.staging) throw new Error('Recording staging is unavailable during finalization.');
  const ids = new Set<string>();
  for (const artifact of input.artifacts) {
    if (artifact.size <= 0) {
      throw new Error(`Recording ${artifact.artifactId} has no media bytes to save.`);
    }
    if (ids.has(artifact.artifactId)) {
      throw new Error(`Duplicate recording artifact: ${artifact.artifactId}.`);
    }
    ids.add(artifact.artifactId);
  }
  const primary = input.artifacts.find(
    (artifact) => artifact.artifactId === input.primaryRecordingId
  );
  if (!primary) throw new Error('Primary recording artifact is unavailable.');
  return primary;
}

async function abortAfterFailure(
  staging: RecordingStagingCoordinator,
  error: unknown
): Promise<never> {
  try {
    await staging.abort();
  } catch (abortError) {
    throw new AggregateError(
      [error, abortError],
      'Recording finalization and staging abort failed.',
      { cause: abortError }
    );
  }
  throw error;
}

export async function finalizeRecording(
  input: FinalizeRecordingInput
): Promise<FinalizeResult | null> {
  const primary = validateArtifacts(input);
  const staging = input.staging!;
  const shouldNotifySaved = input.options?.notifySaved ?? true;
  const shouldNotifyStopped = input.options?.notifyStopped ?? true;
  if (!beginRecordingFinalization(input.primaryRecordingId, logger)) {
    await staging.delete().catch((error) => {
      logger.warn('Replay staging cleanup failed; orphan recovery will retry', {
        errorMessage: stringifyFinalizeError(error),
        recordingId: input.primaryRecordingId,
      });
    });
    return null;
  }

  let terminal = false;
  try {
    if (input.discard) {
      await staging.abort();
      if (shouldNotifyStopped) {
        notifyRecordingStoppedBestEffort('recording-discarded', input.primaryRecordingId);
      }
      terminal = true;
      return null;
    }

    try {
      const settings = await loadSettings().catch(() => null);
      await saveRecordingsBatchWithCompletionSafely(
        input.artifacts.map((artifact) => ({
          blob: artifact.file,
          filename: artifact.filename,
          id: artifact.artifactId,
          storageClass:
            settings?.localStoragePolicy.defaultDestination ??
            DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination,
        })),
        createPostRecordResult(input.primaryRecordingId)
      );
    } catch (error) {
      return await abortAfterFailure(staging, error);
    }
    await staging.delete().catch((error) => {
      logger.warn('Committed recording staging cleanup failed; orphan recovery will retry', {
        errorMessage: stringifyFinalizeError(error),
        recordingId: input.primaryRecordingId,
      });
    });

    logger.info('Recording artifacts saved to media hub', {
      artifactCount: input.artifacts.length,
      recordingId: input.primaryRecordingId,
    });
    void persistStaticFrameSignals(input.primaryRecordingId);
    if (shouldNotifySaved) await publishVideoSavedToIdb(input.primaryRecordingId);
    if (shouldNotifyStopped) {
      notifyRecordingStoppedBestEffort('recording-finalized', input.primaryRecordingId);
    }
    terminal = true;
    return { filename: primary.filename, recordingId: input.primaryRecordingId };
  } finally {
    finishRecordingFinalization(input.primaryRecordingId, terminal);
  }
}
