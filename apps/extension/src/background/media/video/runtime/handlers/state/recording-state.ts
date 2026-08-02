import type { VideoCursorCaptureMode } from '../../../../../../features/video/project/types';
import {
  VideoRecordingStatus,
  type WebcamActualSettings,
  type VideoDisplaySurface,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getVideoRecordingRuntimeState,
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from '../../session-state/service/runtime-state-service';
import {
  finishVideoRecordingStop,
  getVideoRecordingId,
  getVideoRecordingTabId,
  isCurrentVideoRecordingId,
  markVideoRecordingPreparationSettled,
  resetCompletedVideoRecordingSession,
  setControlledCursorDisplaySurface,
  setControlledCursorVerifiedMode,
} from '../../../session-state';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
  restoreCurrentRecordingFromLease,
} from '../../../recording-control-lease';
import { clearCameraRecorderControlGrant } from '../../camera-recorder-control';
import { resetRecordingTabId } from '../../manager';
import { clearRecordingStartActivationWatchdog } from '../../../manager/start-activation-watchdog';
import { createAsyncLifecycleRoute, HANDLED_ASYNC_RESULT, type RouteResult } from '../shared';
import { releaseVideoCaptureSurface } from '../../../capture-surface';

export {
  handleAcknowledgePostRecordResult,
  handleRecordingState,
} from './recording-state-response';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

async function isCurrentRecordingLifecycleEvent(message: {
  recordingId?: string;
}): Promise<boolean> {
  const recordingId = getVideoRecordingId();
  if (recordingId && message.recordingId === recordingId) {
    return true;
  }

  if (message.recordingId && (await restoreCurrentRecordingFromLease(message.recordingId))) {
    return true;
  }

  if (!recordingId || message.recordingId !== recordingId) {
    logger.warn('Ignoring stale offscreen recording lifecycle event', {
      currentRecordingId: recordingId,
      eventRecordingId: message.recordingId,
    });
    return false;
  }

  return true;
}

export function handleRecordingTabId(
  sendResponse: ResponseSender,
  senderTabId?: number
): RouteResult {
  void sendHydratedRecordingTabId(sendResponse, senderTabId).catch((error) => {
    logger.warn('Failed to hydrate recording lease before tab response', error);
    sendRecordingTabIdResponse(sendResponse, senderTabId);
  });
  return HANDLED_ASYNC_RESULT;
}

async function sendHydratedRecordingTabId(
  sendResponse: ResponseSender,
  senderTabId?: number
): Promise<void> {
  await ensureActiveVideoRecordingLeaseHydrated();
  sendRecordingTabIdResponse(sendResponse, senderTabId);
}

function sendRecordingTabIdResponse(sendResponse: ResponseSender, senderTabId?: number): void {
  const recordingTabId = getVideoRecordingTabId();
  sendResponse({
    success: true,
    isCurrentTab: recordingTabId !== null && senderTabId === recordingTabId,
    tabId: recordingTabId ?? undefined,
  });
}

export function handleRecordingDurationUpdated(
  message: {
    duration?: number;
    recordingId?: string;
  },
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    updateRecordingDurationIfCurrent(message),
    sendResponse,
    logger,
    'Failed to process recording duration update'
  );
}

async function updateRecordingDurationIfCurrent(message: {
  duration?: number;
  recordingId?: string;
}): Promise<void> {
  if (!(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  setVideoRecordingRuntimeState({ duration: Number(message.duration) || 0 });
}

export function handleOffscreenRecordingStarted(
  message:
    | {
        cursorCaptureMode?: VideoCursorCaptureMode;
        displaySurface?: VideoDisplaySurface;
        recordingId?: string;
        webcamSettings?: WebcamActualSettings;
      }
    | undefined,
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleOffscreenRecordingStartedIfCurrent(message),
    sendResponse,
    logger,
    'Failed to process recording started lifecycle event'
  );
}

async function handleOffscreenRecordingStartedIfCurrent(message?: {
  cursorCaptureMode?: VideoCursorCaptureMode;
  displaySurface?: VideoDisplaySurface;
  recordingId?: string;
  webcamSettings?: WebcamActualSettings;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  clearRecordingStartActivationWatchdog(message.recordingId);
  markVideoRecordingPreparationSettled();
  if (message?.cursorCaptureMode) {
    setControlledCursorVerifiedMode(message.cursorCaptureMode);
  }
  setControlledCursorDisplaySurface(message?.displaySurface ?? null);
  const currentState = getVideoRecordingRuntimeState();
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: null,
    ...(message.webcamSettings === undefined || currentState.liveMedia == null
      ? {}
      : {
          liveMedia: {
            ...currentState.liveMedia,
            webcamSettings: message.webcamSettings,
          },
        }),
  });
}

export function handleOffscreenRecordingStopped(
  message: { recordingId?: string } | undefined,
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleOffscreenRecordingStoppedIfCurrent(message),
    sendResponse,
    logger,
    'Failed to process recording stopped lifecycle event'
  );
}

async function handleOffscreenRecordingStoppedIfCurrent(message?: {
  recordingId?: string;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  await releaseVideoCaptureSurface(message.recordingId);
  if (isCurrentVideoRecordingId(message.recordingId)) {
    finishVideoRecordingStop();
    resetCompletedVideoRecordingSession(message.recordingId);
    resetRecordingTabId();
    resetVideoRecordingRuntimeState();
  }
  await clearCameraRecorderControlGrant(message.recordingId);
  await clearActiveVideoRecordingLease(message.recordingId);
}

export function handleOffscreenRecordingPaused(
  message: { recordingId?: string } | undefined,
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleOffscreenRecordingPausedIfCurrent(message),
    sendResponse,
    logger,
    'Failed to process recording paused lifecycle event'
  );
}

async function handleOffscreenRecordingPausedIfCurrent(message?: {
  recordingId?: string;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  logger.log('Recording paused');
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.PAUSED });
}

export function handleOffscreenRecordingResumed(
  message: { recordingId?: string } | undefined,
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleOffscreenRecordingResumedIfCurrent(message),
    sendResponse,
    logger,
    'Failed to process recording resumed lifecycle event'
  );
}

async function handleOffscreenRecordingResumedIfCurrent(message?: {
  recordingId?: string;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  logger.log('Recording resumed');
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
}
