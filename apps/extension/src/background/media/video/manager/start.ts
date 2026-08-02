// Video Manager - orchestrates recording start across capture sources.

import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { finalizeRecordingStart, isStartCancelled, runCountdown } from './flow';
import {
  beginVideoRecordingPreparation,
  hasActiveVideoRecordingSession,
  isVideoRecordingPreparationInProgress,
  resetVideoRecordingStartSession,
  clearVideoRecordingOffscreenStartDispatched,
  setVideoRecordingId,
} from '../session-state';
import { resetVideoRecordingRuntimeState } from '../runtime/session-state';
import { initializeRecordingContext } from './recording-context.prepare';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { sanitizeRecordingSettings } from './start-settings';
import { acquireMediaMutationPermit } from '../../../mutation-exclusion/media-activity';
import { finalizeAcceptedRecordingStart, type RecordingStartResult } from './start-delivery';
import { releaseVideoCaptureSurface, waitForVideoCaptureSurfaceRecovery } from '../capture-surface';
import {
  clearActiveVideoRecordingLease,
  issuePreparedVideoRecordingLease,
} from '../recording-control-lease';
import {
  RecordingStartCleanupFailure,
  requestBoundOffscreenRecordingStop,
  requiresRecordingAuthorityRetention,
  type RecordingSourceBinding,
} from '../offscreen-recording-stop';
import { readStoredVideoPostRecordResult } from '../../../storage/video/post-record-result';

const logger = createLogger({ namespace: 'BackgroundVideoManager' });

function rollbackRecordingStartState(): void {
  setVideoRecordingId(null);
  resetVideoRecordingStartSession();
  resetVideoRecordingRuntimeState();
}

async function disposePreparedMultiSourceStreams(
  captureMode: CaptureMode,
  settings: VideoRecordingSettings
): Promise<void> {
  if (captureMode !== CaptureMode.SCREEN || normalizeVideoSourceCount(settings.sourceCount) <= 1) {
    return;
  }

  await getBackgroundRuntimeMessaging()
    .sendRuntimeMessage(
      attachOffscreenCommandCapability({ type: VideoMessageType.DISPOSE_DESKTOP_MEDIA })
    )
    .catch((error) => {
      logger.warn('Failed to dispose prepared multi-source streams after start exit', error);
    });
}

export async function startRecording(
  tabId: number | undefined,
  settings: VideoRecordingSettings,
  captureMode: CaptureMode = CaptureMode.TAB,
  viewportPresetId: string | null = null,
  ownerSenderUrl?: string
): Promise<RecordingStartResult> {
  if (!ownerSenderUrl) {
    return { error: 'Unauthorized recording control sender', result: 'failed' };
  }

  const releaseStartPermit = acquireMediaMutationPermit();
  if (!releaseStartPermit) {
    return { error: 'Local data erasure is in progress', result: 'failed' };
  }

  try {
    return await startRecordingWithPermit(
      tabId,
      settings,
      captureMode,
      viewportPresetId,
      ownerSenderUrl
    );
  } finally {
    releaseStartPermit();
  }
}

async function startRecordingWithPermit(
  tabId: number | undefined,
  settings: VideoRecordingSettings,
  captureMode: CaptureMode,
  viewportPresetId: string | null,
  ownerSenderUrl: string
): Promise<RecordingStartResult> {
  try {
    await waitForVideoCaptureSurfaceRecovery();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      result: 'failed',
    };
  }

  try {
    const postRecordState = await readStoredVideoPostRecordResult();
    if (postRecordState?.status === 'staged' || postRecordState?.status === 'ready') {
      return {
        error: 'Resolve the previous recording before starting another.',
        result: 'failed',
      };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      result: 'failed',
    };
  }

  if (isVideoRecordingPreparationInProgress()) {
    logger.warn('Ignoring duplicate start while recording initialization is already in progress');
    return { result: 'duplicate-preparing' };
  }
  if (hasActiveVideoRecordingSession()) {
    logger.warn('Ignoring duplicate start while a recording is already active');
    return { result: 'already-active' };
  }

  const sanitizedSettings = sanitizeRecordingSettings(settings, captureMode);

  beginVideoRecordingPreparation(captureMode, sanitizedSettings, viewportPresetId);

  try {
    return await executeRecordingStart({
      captureMode,
      ownerSenderUrl,
      settings: sanitizedSettings,
      tabId,
      viewportPresetId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    try {
      await notifyRecordingStartFailed(errorMessage, {
        retainAuthority: requiresRecordingAuthorityRetention(error),
      });
      return { error: errorMessage, result: 'failed' };
    } catch (releaseError) {
      const releaseMessage =
        releaseError instanceof Error ? releaseError.message : String(releaseError);
      logger.error('Failed to restore capture surface after recording start failure', releaseError);
      return { error: releaseMessage, result: 'failed' };
    }
  }
}

async function executeRecordingStart(props: {
  captureMode: CaptureMode;
  ownerSenderUrl: string;
  settings: VideoRecordingSettings;
  tabId: number | undefined;
  viewportPresetId: string | null;
}): Promise<RecordingStartResult> {
  const { tabId, captureMode, ownerSenderUrl, viewportPresetId, settings } = props;
  if (captureMode !== CaptureMode.CAMERA && tabId === undefined) {
    throw new Error('No tab ID');
  }

  const recordingId = crypto.randomUUID();
  let preparedContextRequiresDisposal = false;
  let cleanupAttempted = false;
  let preparedBindingPersisted = false;
  let sourceBinding: RecordingSourceBinding | null = null;
  setVideoRecordingId(recordingId);
  logger.log('Starting recording', { captureMode, recordingId, tabId: tabId ?? null });

  try {
    const context = await initializeRecordingContext({
      captureMode,
      settings,
      tabId: tabId ?? null,
      viewportPresetId,
    });
    if (!context) {
      await releaseVideoCaptureSurface(recordingId);
      rollbackRecordingStartState();
      return { result: 'cancelled' };
    }
    preparedContextRequiresDisposal = true;
    sourceBinding = {
      generation: context.generation,
      recordingId,
      streamInstanceId: crypto.randomUUID(),
    };
    const preparedLease = await issuePreparedVideoRecordingLease({
      captureMode,
      cropRegion: context.captureSource.cropRegion ?? null,
      ownerSenderUrl,
      surfaceBinding: {
        generation: sourceBinding.generation,
        streamInstanceId: sourceBinding.streamInstanceId,
      },
      viewportPresetId: context.viewportPresetId,
    });
    if (!preparedLease) throw new Error('Failed to issue recording control capability');
    preparedBindingPersisted = true;
    if (isStartCancelled(tabId ?? null, captureMode)) {
      cleanupAttempted = true;
      await cleanupFailedRecordingStart({
        captureMode,
        primaryError: new Error('Recording start was cancelled before source dispatch'),
        settings,
        sourceBinding,
      });
      await releaseVideoCaptureSurface(recordingId);
      rollbackRecordingStartState();
      return { result: 'cancelled' };
    }

    await finalizeRecordingStart({
      ...context,
      recordingId,
      streamInstanceId: sourceBinding.streamInstanceId,
    });

    const countdownReady = await runCountdown(tabId ?? null, captureMode, settings);
    if (!countdownReady || isStartCancelled(tabId ?? null, captureMode)) {
      cleanupAttempted = true;
      await cleanupFailedRecordingStart({
        captureMode,
        primaryError: new Error('Recording start was cancelled'),
        settings,
        sourceBinding,
      });
      await releaseVideoCaptureSurface(recordingId);
      rollbackRecordingStartState();
      return { result: 'cancelled' };
    }

    return await finalizeAcceptedRecordingStart(
      recordingId,
      context,
      sourceBinding.streamInstanceId
    );
  } catch (error) {
    if (!cleanupAttempted && sourceBinding && preparedBindingPersisted) {
      const primaryError =
        error instanceof RecordingStartCleanupFailure ? error.primaryError : error;
      await cleanupFailedRecordingStart({
        captureMode,
        primaryError,
        settings,
        sourceBinding,
        shouldDisposePreparedContext: preparedContextRequiresDisposal,
      });
      throw primaryError;
    }
    if (!cleanupAttempted && preparedContextRequiresDisposal) {
      await disposePreparedMultiSourceStreams(captureMode, settings);
    }
    throw error;
  }
}

async function cleanupFailedRecordingStart(args: {
  captureMode: CaptureMode;
  primaryError: unknown;
  settings: VideoRecordingSettings;
  shouldDisposePreparedContext?: boolean;
  sourceBinding: RecordingSourceBinding;
}): Promise<void> {
  if (args.shouldDisposePreparedContext !== false) {
    await disposePreparedMultiSourceStreams(args.captureMode, args.settings);
  }
  try {
    await requestBoundOffscreenRecordingStop(args.sourceBinding, true);
    await clearActiveVideoRecordingLease(args.sourceBinding.recordingId);
    clearVideoRecordingOffscreenStartDispatched();
  } catch (cleanupError) {
    throw new RecordingStartCleanupFailure(args.primaryError, cleanupError);
  }
}
