import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
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

function completeEarlyStop(): void {
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  finishVideoRecordingStop();
  logger.log('Recording start cancelled before recorder activation');
}

function isRecordingStartCancellable(): boolean {
  return isVideoRecordingPreparationInProgress() || getVideoRecordingCountdownSessionId() !== null;
}

async function sendStopSignals(
  discard: boolean,
  requireAcknowledgement = false,
  failureLogging: StopFailureLogging = 'detailed'
): Promise<RecordingStopResult> {
  const previousState = getVideoRecordingRuntimeState();
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });

  try {
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        discard,
      })
    );
    if (response?.success === false) {
      throw new Error(response.error ?? 'Offscreen recording stop rejected');
    }
    if (requireAcknowledgement && (response?.success !== true || response.result !== 'accepted')) {
      throw new Error('Offscreen recording stop acknowledgement missing');
    }
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
  return { result: 'accepted' };
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
    completeEarlyStop();
    return { result: 'cancelled-before-active' };
  }

  return await sendStopSignals(discard);
}

export async function stopRecordingForPrivacyErasure(): Promise<RecordingStopResult> {
  const skipResult = resolveStopSkipResult();
  if (skipResult?.result === 'no-active-recording') {
    return skipResult;
  }
  if (skipResult?.result === 'already-stopping') {
    return sendStopSignals(true, true, 'fixed');
  }

  const context = beginVideoRecordingStop();
  logger.log('Stopping recording for local data erasure', {
    mode: context.mode,
    tabId: context.tabId,
  });
  runStopSideEffects(context, 'fixed');

  if (context.shouldResetImmediately) {
    completeEarlyStop();
    return { result: 'cancelled-before-active' };
  }

  return sendStopSignals(true, true, 'fixed');
}

export async function cancelRecordingStart(): Promise<RecordingStopResult> {
  if (!isRecordingStartCancellable()) {
    logger.warn('Ignoring start-cancellation request because recording start is not active');
    return { result: 'no-active-recording' };
  }

  return await stopRecording(true);
}
