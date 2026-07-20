// Video Manager - orchestrates recording start across capture sources.

import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { isStartCancelled, runCountdown } from './flow';
import {
  beginVideoRecordingPreparation,
  hasActiveVideoRecordingSession,
  isVideoRecordingPreparationInProgress,
  resetVideoRecordingStartSession,
  setOpenEditorAfterRecording,
  setVideoRecordingId,
} from '../session-state';
import { resetVideoRecordingRuntimeState } from '../runtime/session-state';
import { initializeRecordingContext, normalizeViewportPreset } from './recording-context';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { sanitizeRecordingSettings } from './start-settings';
import { acquireMediaMutationPermit } from '../../lifecycle-gate';
import { finalizeAcceptedRecordingStart, type RecordingStartResult } from './start-delivery';

const logger = createLogger({ namespace: 'BackgroundVideoManager' });

function rollbackRecordingStartState(): void {
  setVideoRecordingId(null);
  setOpenEditorAfterRecording(false);
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
  viewportPreset?: VideoViewportPresetSelection,
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
      viewportPreset,
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
  viewportPreset: VideoViewportPresetSelection | undefined,
  ownerSenderUrl: string
): Promise<RecordingStartResult> {
  if (isVideoRecordingPreparationInProgress()) {
    logger.warn('Ignoring duplicate start while recording initialization is already in progress');
    return { result: 'duplicate-preparing' };
  }
  if (hasActiveVideoRecordingSession()) {
    logger.warn('Ignoring duplicate start while a recording is already active');
    return { result: 'already-active' };
  }

  const normalizedViewportPreset = normalizeViewportPreset(captureMode, viewportPreset);
  const sanitizedSettings = sanitizeRecordingSettings(settings, captureMode);

  beginVideoRecordingPreparation(captureMode, sanitizedSettings, normalizedViewportPreset);

  try {
    return await executeRecordingStart({
      captureMode,
      ownerSenderUrl,
      settings: sanitizedSettings,
      tabId,
      ...(normalizedViewportPreset === undefined
        ? {}
        : { viewportPreset: normalizedViewportPreset }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    notifyRecordingStartFailed(errorMessage);
    return { error: errorMessage, result: 'failed' };
  }
}

async function executeRecordingStart(props: {
  captureMode: CaptureMode;
  ownerSenderUrl: string;
  settings: VideoRecordingSettings;
  tabId: number | undefined;
  viewportPreset?: VideoViewportPresetSelection;
}): Promise<RecordingStartResult> {
  const { tabId, captureMode, ownerSenderUrl, viewportPreset, settings } = props;
  if (captureMode !== CaptureMode.CAMERA && tabId === undefined) {
    throw new Error('No tab ID');
  }

  const recordingId = crypto.randomUUID();
  let preparedContextRequiresDisposal = false;
  setVideoRecordingId(recordingId);
  setOpenEditorAfterRecording(settings.openEditorAfterRecording);
  logger.log('Starting recording', { captureMode, recordingId, tabId: tabId ?? null });

  try {
    const context = await initializeRecordingContext({
      captureMode,
      settings,
      tabId: tabId ?? null,
      ...(viewportPreset === undefined ? {} : { viewportPreset }),
    });
    if (!context) {
      rollbackRecordingStartState();
      return { result: 'cancelled' };
    }
    preparedContextRequiresDisposal = true;

    const countdownReady = await runCountdown(tabId ?? null, captureMode, settings);
    if (!countdownReady || isStartCancelled(tabId ?? null, captureMode)) {
      await disposePreparedMultiSourceStreams(captureMode, settings);
      rollbackRecordingStartState();
      return { result: 'cancelled' };
    }

    return await finalizeAcceptedRecordingStart(recordingId, context, ownerSenderUrl);
  } catch (error) {
    if (preparedContextRequiresDisposal) {
      await disposePreparedMultiSourceStreams(captureMode, settings);
    }
    throw error;
  }
}
