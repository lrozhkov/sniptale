import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
import { recordingContext } from './context';
import { cleanupResources, startRecording as startRecordingImpl } from './start/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  hasActiveSidecarSession,
  pauseActiveSidecarRecorders,
  resumeActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from './sidecar';
import {
  cancelPendingMultiSourceRecordingStart,
  hasActiveMultiSourceRecording,
  getActiveMultiSourceRecordingId,
  pauseMultiSourceRecording,
  resumeMultiSourceRecording,
  startMultiSourceRecording,
  stopMultiSourceRecording,
} from './multi-source';

const logger = createLogger({ namespace: 'OffscreenRecordingController' });
const STOP_RECORDING_TIMEOUT_MS = 10_000;
let pendingRecordingStart: Promise<void> | null = null;

type StateMessage =
  | typeof VideoMessageType.OFFSCREEN_RECORDING_PAUSED
  | typeof VideoMessageType.OFFSCREEN_RECORDING_RESUMED;

function hasActiveRecordingSession(): boolean {
  return (
    recordingContext.hasActiveRecordingSession() ||
    hasActiveSidecarSession() ||
    hasActiveMultiSourceRecording()
  );
}

function clearPendingStopRequest(): {
  reject: ((reason?: unknown) => void) | null;
  resolve: (() => void) | null;
} {
  return recordingContext.clearStopRequest();
}

function notifyRecordingStoppedBestEffort(
  reason: string,
  recordingId = recordingContext.currentRecordingId
): void {
  if (!recordingId) {
    return;
  }

  sendRuntimeMessageBestEffort({
    context: { reason, recordingId },
    logger,
    logMessage: 'Failed to notify runtime that recording stopped',
    payload: {
      type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
      recordingId,
    },
  });
}

export function startRecording(params: Parameters<typeof startRecordingImpl>[0]): Promise<void> {
  if (pendingRecordingStart || hasActiveRecordingSession()) {
    return Promise.reject(new Error(translate('background.runtime.recordingAlreadyRunning')));
  }

  const work =
    (params.settings?.sourceCount ?? 1) > 1
      ? startMultiSourceRecording({
          recordingId: params.recordingId ?? `rec-${Date.now()}`,
          settings: {
            ...params.settings,
            systemAudioEnabled: false,
          },
        })
      : startRecordingImpl(params);
  const tracked = work.finally(() => {
    if (pendingRecordingStart === tracked) {
      pendingRecordingStart = null;
    }
  });
  pendingRecordingStart = tracked;
  return tracked;
}

function handleStopWithoutActiveRecorder(hadActiveSession: boolean): Promise<void> {
  logger.debug('Stop requested without an active recording');
  const recordingId = recordingContext.currentRecordingId;
  cleanupResources();
  if (hadActiveSession) {
    notifyRecordingStoppedBestEffort('stop-request-without-active-recorder', recordingId);
  }
  return Promise.resolve();
}

function stopMediaRecorderWithFlush(mediaRecorder: MediaRecorder): void {
  if (typeof mediaRecorder.requestData === 'function') {
    mediaRecorder.requestData();
  }
  mediaRecorder.stop();
}

function publishFinalRecordingDuration(
  durationTracker: typeof recordingContext.durationTracker
): void {
  durationTracker.freeze();
  durationTracker.stopSegment();
  durationTracker.publishDuration();
  logger.debug('Published recording duration', {
    seconds: durationTracker.getElapsedSeconds(),
  });
}

async function stopActiveRecording(discard: boolean): Promise<void> {
  if (hasActiveMultiSourceRecording()) {
    return stopMultiSourceRecording(discard);
  }

  const { mediaRecorder, durationTracker } = recordingContext;
  const hadActiveSession = hasActiveRecordingSession();
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return handleStopWithoutActiveRecorder(hadActiveSession);
  }

  return new Promise((resolve, reject) => {
    logger.debug('Stopping recording');
    publishFinalRecordingDuration(durationTracker);

    const timeoutId = setTimeout(() => {
      const pendingStopRequest = clearPendingStopRequest();
      if (!pendingStopRequest.reject) {
        return;
      }

      cleanupResources();
      pendingStopRequest.reject(new Error(translate('background.runtime.recordingStopTimeout')));
    }, STOP_RECORDING_TIMEOUT_MS);

    recordingContext.beginStopRequest({
      discard,
      resolve: () => {
        clearTimeout(timeoutId);
        clearPendingStopRequest();
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        clearPendingStopRequest();
        reject(error);
      },
    });

    try {
      void stopActiveSidecarRecordersWithFlush().catch(() => undefined);
      stopMediaRecorderWithFlush(mediaRecorder);
    } catch (error) {
      clearTimeout(timeoutId);
      clearPendingStopRequest();
      cleanupResources();
      reject(error);
    }
  });
}

export async function stopRecording(discard = false): Promise<void> {
  const pendingStart = pendingRecordingStart;
  cancelPendingMultiSourceRecordingStart();
  await stopActiveRecording(discard);
  if (!pendingStart) {
    return;
  }

  await waitForPendingStart(pendingStart);
  await stopActiveRecording(discard);
}

async function waitForPendingStart(pendingStart: Promise<void>): Promise<void> {
  let timeoutId!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(translate('background.runtime.recordingStopTimeout')));
    }, STOP_RECORDING_TIMEOUT_MS);
  });
  await Promise.race([pendingStart.catch(() => undefined), timeout]).finally(() =>
    clearTimeout(timeoutId)
  );
}

function notifyState(
  type: StateMessage,
  action: 'paused' | 'resumed',
  recordingId: string | null
): void {
  if (!recordingId) return;
  sendRuntimeMessageBestEffort({
    context: { recordingId },
    logger,
    logMessage: `Failed to notify runtime that recording ${action}`,
    payload: { type, recordingId },
  });
}

export function pauseRecording(): void {
  if (hasActiveMultiSourceRecording()) {
    pauseMultiSourceRecording();
    notifyState(
      VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
      'paused',
      getActiveMultiSourceRecordingId()
    );
    return;
  }

  const { mediaRecorder, durationTracker } = recordingContext;
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    logger.debug('Pause requested while recording is not active');
    return;
  }

  logger.debug('Pausing recording');
  mediaRecorder.pause();
  pauseActiveSidecarRecorders();
  durationTracker.freeze();
  durationTracker.stopSegment();
  durationTracker.publishDuration();

  notifyState(
    VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    'paused',
    recordingContext.currentRecordingId
  );
}

export function resumeRecording(): void {
  if (hasActiveMultiSourceRecording()) {
    resumeMultiSourceRecording();
    notifyState(
      VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
      'resumed',
      getActiveMultiSourceRecordingId()
    );
    return;
  }

  const { mediaRecorder, durationTracker } = recordingContext;
  if (!mediaRecorder || mediaRecorder.state !== 'paused') {
    logger.debug('Resume requested while recording is not paused');
    return;
  }

  logger.debug('Resuming recording');
  mediaRecorder.resume();
  resumeActiveSidecarRecorders();
  durationTracker.startSegment();

  notifyState(
    VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    'resumed',
    recordingContext.currentRecordingId
  );
}

export function updateViewportCrop(params: {
  targetResolution?: { width: number; height: number };
  viewportSizeInPixels?: { width: number; height: number };
}): void {
  recordingContext.updateViewportPresetCrop?.(params);
}

export function setViewportDrawState(params: { frozen: boolean; navigationEpoch: number }): void {
  if (params.navigationEpoch < recordingContext.viewportNavigationEpoch) {
    return;
  }

  recordingContext.viewportNavigationEpoch = params.navigationEpoch;
  recordingContext.viewportDrawFrozen = params.frozen;
  recordingContext.updateViewportPresetDrawState?.(params);
}
