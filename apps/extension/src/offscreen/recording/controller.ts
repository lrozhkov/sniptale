import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { recordingContext, type RecordingStopOutcome } from './context';
import { cleanupResources } from './start/cleanup';
import { startRecording as startRecordingImpl } from './start/index';
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
import { updateRecordingSettings as applyRecordingSettings } from './update-settings';

const logger = createLogger({ namespace: 'OffscreenRecordingController' });
const runtimeMessaging = createRuntimeMessagingTransport();
const STOP_RECORDING_TIMEOUT_MS = 10_000;
let pendingRecordingStart: Promise<void> | null = null;
let activeRecordingBinding: RecordingSourceBinding | null = null;

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
  resolve: ((outcome?: RecordingStopOutcome) => void) | null;
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

  const binding = {
    generation: params.generation,
    recordingId: params.recordingId,
    streamInstanceId: params.streamInstanceId,
  };
  activeRecordingBinding = binding;

  const work =
    (params.settings?.sourceCount ?? 1) > 1
      ? startMultiSourceRecording({
          recordingId: params.recordingId ?? `rec-${Date.now()}`,
          settings: {
            ...params.settings,
            systemAudioEnabled: false,
          },
        })
      : startRecordingImpl(params, runtimeMessaging);
  const tracked = work
    .then(
      () => {
        if (!hasActiveRecordingSession() && matchesActiveRecordingBinding(binding)) {
          activeRecordingBinding = null;
        }
      },
      (error: unknown) => {
        if (matchesActiveRecordingBinding(binding)) activeRecordingBinding = null;
        throw error;
      }
    )
    .finally(() => {
      if (pendingRecordingStart === tracked) {
        pendingRecordingStart = null;
      }
    });
  pendingRecordingStart = tracked;
  return tracked;
}

function handleStopWithoutActiveRecorder(hadActiveSession: boolean): Promise<RecordingStopOutcome> {
  logger.debug('Stop requested without an active recording');
  const recordingId = recordingContext.currentRecordingId;
  cleanupResources();
  if (hadActiveSession) {
    notifyRecordingStoppedBestEffort('stop-request-without-active-recorder', recordingId);
  }
  return Promise.resolve({ result: 'stopped' });
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

async function stopActiveRecording(discard: boolean): Promise<RecordingStopOutcome> {
  if (hasActiveMultiSourceRecording()) {
    await stopMultiSourceRecording(discard);
    return { result: 'stopped' };
  }

  const { mediaRecorder, durationTracker } = recordingContext;
  const hadActiveSession = hasActiveRecordingSession();
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return handleStopWithoutActiveRecorder(hadActiveSession);
  }

  return new Promise((resolve) => {
    logger.debug('Stopping recording');
    publishFinalRecordingDuration(durationTracker);

    const timeoutId = setTimeout(() => {
      const pendingStopRequest = clearPendingStopRequest();
      if (!pendingStopRequest.reject) {
        return;
      }

      const error = translate('background.runtime.recordingStopTimeout');
      cleanupResources();
      pendingStopRequest.resolve?.({ error, result: 'terminal-failure' });
    }, STOP_RECORDING_TIMEOUT_MS);

    recordingContext.beginStopRequest({
      discard,
      resolve: (outcome = { result: 'stopped' }) => {
        clearTimeout(timeoutId);
        clearPendingStopRequest();
        resolve(outcome);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        clearPendingStopRequest();
        resolve({
          error: error instanceof Error ? error.message : String(error),
          result: 'terminal-failure',
        });
      },
    });

    try {
      void stopActiveSidecarRecordersWithFlush().catch(() => undefined);
      stopMediaRecorderWithFlush(mediaRecorder);
    } catch (error) {
      clearTimeout(timeoutId);
      const pendingStopRequest = clearPendingStopRequest();
      cleanupResources();
      pendingStopRequest.resolve?.({
        error: error instanceof Error ? error.message : String(error),
        result: 'terminal-failure',
      });
    }
  });
}

export async function stopRecording(
  binding: RecordingSourceBinding,
  discard = false
): Promise<RecordingStopOutcome> {
  assertActiveRecordingBinding(binding, { allowIdleStop: true });
  const pendingStart = pendingRecordingStart;
  cancelPendingMultiSourceRecordingStart();
  let outcome = await stopActiveRecording(discard);
  if (!pendingStart) {
    if (outcome.result === 'stopped') activeRecordingBinding = null;
    return outcome;
  }

  const pendingStartSettled = await waitForPendingStart(pendingStart);
  if (!pendingStartSettled) {
    activeRecordingBinding = null;
    return {
      error: translate('background.runtime.recordingStopTimeout'),
      result: 'terminal-failure',
    };
  }
  outcome = await stopActiveRecording(discard);
  if (outcome.result === 'stopped' || !hasActiveRecordingSession()) {
    activeRecordingBinding = null;
  }
  return outcome;
}

async function waitForPendingStart(pendingStart: Promise<void>): Promise<boolean> {
  let timeoutId!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<false>((resolve) => {
    timeoutId = setTimeout(() => {
      cleanupResources();
      resolve(false);
    }, STOP_RECORDING_TIMEOUT_MS);
  });
  return await Promise.race([
    pendingStart.then(
      () => true,
      () => true
    ),
    timeout,
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
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

type RecordingSourceBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

function matchesActiveRecordingBinding(binding: RecordingSourceBinding): boolean {
  return (
    activeRecordingBinding?.recordingId === binding.recordingId &&
    activeRecordingBinding.generation === binding.generation &&
    activeRecordingBinding.streamInstanceId === binding.streamInstanceId
  );
}

function assertActiveRecordingBinding(
  binding: RecordingSourceBinding,
  options: { allowIdleStop?: boolean } = {}
): void {
  if (!activeRecordingBinding) {
    if (recordingContext.matchesSourceBinding(binding)) return;
    if (options.allowIdleStop && !pendingRecordingStart && !hasActiveRecordingSession()) return;
    throw new Error('Recording source binding is unavailable');
  }
  if (!matchesActiveRecordingBinding(binding)) {
    throw new Error('Stale recording source binding');
  }
  if (
    recordingContext.currentRecordingId !== null &&
    !recordingContext.matchesSourceBinding(binding)
  ) {
    throw new Error('Stale recording source binding');
  }
}

export function pauseRecording(binding: RecordingSourceBinding): void {
  assertActiveRecordingBinding(binding);
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

export function resumeRecording(binding: RecordingSourceBinding): void {
  assertActiveRecordingBinding(binding);
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

export async function setViewportDrawState(
  binding: RecordingSourceBinding,
  frozen: boolean
): Promise<void> {
  assertActiveRecordingBinding(binding);
  const controls = recordingContext.tabOutputControls;
  if (!controls) throw new Error('Tab output frame controls are unavailable');
  if (frozen) {
    controls.suspend();
    return;
  }
  await controls.resume();
}

export function updateRecordingSettings(
  binding: RecordingSourceBinding,
  patch: { microphoneEnabled?: boolean; webcamEnabled?: boolean }
): void {
  assertActiveRecordingBinding(binding);
  applyRecordingSettings(patch);
}
