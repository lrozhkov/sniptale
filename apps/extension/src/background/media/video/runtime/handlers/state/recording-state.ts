import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockAnchor,
} from '../../../../../../contracts/video/recording-frame-clock';
import {
  enableControlledCursorCapture,
  syncControlledCursorCapture,
} from '../../manager/controlled-cursor/messages';
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
  setVideoRecordingRuntimeState,
} from '../../session-state/service/runtime-state-service';
import {
  getVideoRecordingCaptureMode,
  isVideoRecordingStopInProgress,
  setRecordingFrameClock,
  getVideoRecordingTabId,
  isCurrentVideoRecordingId,
  markVideoRecordingPreparationSettled,
  setControlledCursorDisplaySurface,
  setControlledCursorVerifiedMode,
} from '../../../session-state';
import { getActiveVideoRecordingLeaseSnapshot } from '../../../recording-control-lease';
import { ensureActiveVideoRecordingLeaseHydrated } from '../../recording-completion';
import { clearRecordingStartActivationWatchdog } from '../../../manager/start-activation-watchdog';
import { createAsyncLifecycleRoute, HANDLED_ASYNC_RESULT, type RouteResult } from '../shared';
import {
  completeVideoRecording,
  isCurrentRecordingLifecycleEvent,
  canPublishLiveRecordingState,
} from '../../recording-completion';

export {
  handleAcknowledgePostRecordResult,
  handleRecordingState,
} from './recording-state-response';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

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
  if (canPublishLiveRecordingState(message.recordingId))
    setVideoRecordingRuntimeState({ duration: Number(message.duration) || 0 });
}

export function handleOffscreenRecordingStarted(
  message:
    | {
        cursorCaptureMode?: VideoCursorCaptureMode;
        displaySurface?: VideoDisplaySurface;
        recordingId?: string;
        webcamSettings?: WebcamActualSettings;
        frameClock?: RecordingFrameClockAnchor | null;
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
  frameClock?: RecordingFrameClockAnchor | null;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  if (!(await synchronizeExactRecordingHistory(message, 'start'))) return;
  if (!canPublishLiveRecordingState(message.recordingId)) return;
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
  message: { recordingId?: string; frameClock?: RecordingFrameClockAnchor | null } | undefined,
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
  if (!message || !(await isCurrentRecordingLifecycleEvent(message, true))) {
    return;
  }
  if (message.recordingId) await completeVideoRecording(message.recordingId);
}

export function handleOffscreenRecordingPaused(
  message: { recordingId?: string; frameClock?: RecordingFrameClockAnchor | null } | undefined,
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
  frameClock?: RecordingFrameClockAnchor | null;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  if (!(await synchronizeExactRecordingHistory(message, 'pause'))) return;
  if (!canPublishLiveRecordingState(message.recordingId)) return;
  logger.log('Recording paused');
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.PAUSED });
}

export function handleOffscreenRecordingResumed(
  message: { recordingId?: string; frameClock?: RecordingFrameClockAnchor | null } | undefined,
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
  frameClock?: RecordingFrameClockAnchor | null;
}): Promise<void> {
  if (!message || !(await isCurrentRecordingLifecycleEvent(message))) {
    return;
  }
  if (!isCurrentVideoRecordingId(message.recordingId)) return;
  if (!(await synchronizeExactRecordingHistory(message, 'resume'))) return;
  if (!canPublishLiveRecordingState(message.recordingId)) return;
  logger.log('Recording resumed');
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
}

async function synchronizeExactRecordingHistory(
  message: { recordingId?: string; frameClock?: RecordingFrameClockAnchor | null },
  action: 'start' | 'pause' | 'resume'
): Promise<boolean> {
  const mode = getVideoRecordingCaptureMode();
  if (mode !== CaptureMode.TAB && mode !== CaptureMode.TAB_CROP) return true;
  if (isVideoRecordingStopInProgress()) return false;
  const anchor = message.frameClock ?? null;
  if (anchor) {
    const lease = getActiveVideoRecordingLeaseSnapshot();
    const source = lease?.surfaceBinding;
    if (
      !lease ||
      !source ||
      !matchesRecordingFrameClockBinding(anchor, {
        recordingId: lease.recordingId,
        generation: source.generation,
        streamInstanceId: source.streamInstanceId,
      }) ||
      !setRecordingFrameClock(anchor)
    )
      return false;
  }
  const tabId = getVideoRecordingTabId();
  if (tabId !== null && message.recordingId) {
    try {
      if (action === 'start')
        await enableControlledCursorCapture(tabId, message.recordingId, 0, anchor);
      else await syncControlledCursorCapture(tabId, action, anchor);
    } catch {
      logger.warn('Exact recording history synchronization is unavailable');
    }
  }
  return isCurrentVideoRecordingId(message.recordingId) && !isVideoRecordingStopInProgress();
}
