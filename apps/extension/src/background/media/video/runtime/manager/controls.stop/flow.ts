import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getVideoRecordingRuntimeState,
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from '../../session-state';
import {
  beginVideoRecordingStop,
  finishVideoRecordingStop,
  getVideoRecordingCountdownSessionId,
  hasActiveVideoRecordingSession,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
  resetCompletedVideoRecordingSession,
  restoreVideoRecordingOffscreenStartPending,
} from '../../../session-state';
import { runStopSideEffects } from './effects';
import type { StopFailureLogging } from './failure-logging';
import { getVideoRecordingId } from '../../../session-state';
import { releaseVideoCaptureSurface } from '../../../capture-surface';
import { getVideoSurfaceSession } from '../../../capture-surface';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../../../recording-control-lease';
import {
  requestBoundOffscreenRecordingStop,
  type RecordingSourceBinding,
} from '../../../offscreen-recording-stop';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

export const OVERLAY_RESTORE_RETRY_DELAYS_MS = [0, 250, 1000];

type RecordingStopResult =
  | { result: 'accepted' | 'cancelled-before-active' }
  | { result: 'already-stopping' | 'no-active-recording' }
  | { error: string; result: 'failed' };

function resolveStopSkipResult(): Extract<
  RecordingStopResult,
  { result: 'already-stopping' | 'no-active-recording' }
> | null {
  if (isVideoRecordingStopInProgress()) {
    logger.warn('Ignoring duplicate stop request while stop is already in progress');
    return { result: 'already-stopping' };
  }

  if (
    !hasActiveVideoRecordingSession() &&
    !isVideoRecordingPreparationInProgress() &&
    getVideoRecordingCountdownSessionId() === null
  ) {
    logger.warn('Ignoring stop request because no recording is active');
    return { result: 'no-active-recording' };
  }

  return null;
}

async function completeEarlyStop(): Promise<RecordingStopResult> {
  const recordingId = getVideoRecordingId();
  try {
    await releaseVideoCaptureSurface(recordingId);
    await clearActiveVideoRecordingLease(recordingId ?? undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setVideoRecordingRuntimeState({ error: message });
    logger.error('Failed to restore capture surface after early stop', error);
    return { error: message, result: 'failed' };
  }
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  finishVideoRecordingStop();
  logger.log('Recording start cancelled before recorder activation');
  return { result: 'cancelled-before-active' };
}

function isRecordingStartCancellable(): boolean {
  return isVideoRecordingPreparationInProgress() || getVideoRecordingCountdownSessionId() !== null;
}

async function sendStopSignals(
  discard: boolean,
  failureLogging: StopFailureLogging = 'detailed'
): Promise<RecordingStopResult> {
  const recordingId = getVideoRecordingId();
  const sourceBinding = await resolveRecordingSourceBinding(recordingId);
  if (!sourceBinding) {
    const error = 'Recording source binding is unavailable';
    setVideoRecordingRuntimeState({ error });
    return { error, result: 'failed' };
  }
  const previousState = getVideoRecordingRuntimeState();
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
  let terminalError: string | null = null;

  try {
    const acknowledgement = await requestBoundOffscreenRecordingStop(sourceBinding, discard);
    terminalError = acknowledgement.terminalError;
  } catch (error) {
    const failedStopState = getVideoRecordingRuntimeState();
    finishVideoRecordingStop();
    if (
      previousState.status === VideoRecordingStatus.PREPARING &&
      failedStopState.status === VideoRecordingStatus.STOPPING
    ) {
      restoreVideoRecordingOffscreenStartPending();
    }
    setVideoRecordingRuntimeState({
      status: previousState.status,
      countdownEndsAt: previousState.countdownEndsAt,
      error: error instanceof Error ? error.message : String(error),
    });
    if (failureLogging === 'fixed') {
      logger.error('Failed to deliver offscreen stop command during local data erasure');
    } else {
      logger.error('Failed to deliver offscreen stop command', error);
    }
    return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
  }

  logger.log('Stop commands sent; runtime state reset is deferred until offscreen confirms stop');
  try {
    await releaseVideoCaptureSurface(recordingId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setVideoRecordingRuntimeState({ error: message });
    logger.error('Failed to restore capture surface after stop', error);
    return { error: message, result: 'failed' };
  }
  if (terminalError !== null) {
    finishVideoRecordingStop();
    resetCompletedVideoRecordingSession(recordingId ?? undefined);
    resetVideoRecordingRuntimeState();
    await clearActiveVideoRecordingLease(recordingId ?? undefined);
    return { error: terminalError, result: 'failed' };
  }
  return { result: 'accepted' };
}

async function resolveRecordingSourceBinding(
  recordingId: string | null
): Promise<RecordingSourceBinding | null> {
  if (!recordingId) return null;
  const session = getVideoSurfaceSession(recordingId);
  if (session?.streamInstanceId) {
    return {
      generation: session.generation,
      recordingId,
      streamInstanceId: session.streamInstanceId,
    };
  }
  const lease = await ensureActiveVideoRecordingLeaseHydrated();
  return lease?.recordingId === recordingId && lease.surfaceBinding
    ? { recordingId, ...lease.surfaceBinding }
    : null;
}

export async function stopRecording(discard = false): Promise<RecordingStopResult> {
  const skipResult = resolveStopSkipResult();
  if (skipResult) {
    return skipResult;
  }

  const context = beginVideoRecordingStop();
  logger.log('Stopping recording', { mode: context.mode, tabId: context.tabId });

  runStopSideEffects(context);

  if (context.shouldResetImmediately) {
    return completeEarlyStop();
  }

  return await sendStopSignals(discard);
}

export async function stopRecordingForPrivacyErasure(): Promise<RecordingStopResult> {
  const skipResult = resolveStopSkipResult();
  if (skipResult?.result === 'no-active-recording') {
    return skipResult;
  }
  if (skipResult?.result === 'already-stopping') {
    return sendStopSignals(true, 'fixed');
  }

  const context = beginVideoRecordingStop();
  logger.log('Stopping recording for local data erasure', {
    mode: context.mode,
    tabId: context.tabId,
  });
  runStopSideEffects(context, 'fixed');

  if (context.shouldResetImmediately) {
    return completeEarlyStop();
  }

  return sendStopSignals(true, 'fixed');
}

export async function cancelRecordingStart(): Promise<RecordingStopResult> {
  if (!isRecordingStartCancellable()) {
    logger.warn('Ignoring start-cancellation request because recording start is not active');
    return { result: 'no-active-recording' };
  }

  return await stopRecording(true);
}
