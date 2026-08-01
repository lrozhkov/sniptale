import { runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getVideoRecordingTabId,
  getVideoRecordingId,
  isCurrentVideoRecordingId,
  isControlledCursorCaptureEnabled,
  resetVideoRecordingStartSession,
  setVideoRecordingId,
} from '../../session-state';
import { resetVideoRecordingRuntimeState } from '../session-state';
import { getBackgroundRuntimeMessaging } from '../../../../routing-contracts/runtime-messaging/services';
import { cancelVideoSourceReadyWait, releaseVideoCaptureSurface } from '../../capture-surface';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

function hideRecordingOverlay(tabId: number): void {
  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: VideoMessageType.HIDE_RECORDING_OVERLAY,
    }),
    logger,
    'Failed to hide recording overlay after start failure',
    { tabId }
  );
}

function disableControlledCursorCapture(tabId: number): void {
  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
    }),
    logger,
    'Failed to disable controlled cursor capture after start failure',
    { tabId }
  );
}

export async function notifyRecordingStartFailed(
  error: string,
  options: { recordingId?: string; retainAuthority?: boolean } = {}
): Promise<void> {
  logger.error('Recording start failed', error);
  const recordingId = options.recordingId ?? getVideoRecordingId();
  if (options.recordingId && !isCurrentVideoRecordingId(options.recordingId)) {
    logger.warn('Ignoring stale recording start failure', { recordingId: options.recordingId });
    return;
  }
  const recordingTabId = getVideoRecordingTabId();
  if (options.retainAuthority !== true) {
    if (recordingId) cancelVideoSourceReadyWait(recordingId, new Error(error));
    await releaseVideoCaptureSurface(recordingId);
    if (recordingId && !isCurrentVideoRecordingId(recordingId)) {
      logger.warn('Ignored stale recording start cleanup after recording identity changed', {
        recordingId,
      });
      return;
    }
  }

  if (recordingTabId !== null) {
    if (isControlledCursorCaptureEnabled()) {
      disableControlledCursorCapture(recordingTabId);
    }
    hideRecordingOverlay(recordingTabId);
  }

  if (options.retainAuthority !== true) {
    setVideoRecordingId(null);
    resetVideoRecordingStartSession();
    resetVideoRecordingRuntimeState();
  }

  runBestEffort(
    getBackgroundRuntimeMessaging().sendRuntimeMessage({
      type: VideoMessageType.RECORDING_START_FAILED,
      error,
    }),
    logger,
    'Failed to broadcast recording start failure'
  );
}
