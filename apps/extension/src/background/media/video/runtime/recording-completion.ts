import { translate } from '../../../../platform/i18n';
import type { VideoRecordingControlLease } from '../../../storage/video/recording-control-lease';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { setVideoRecordingTabId } from '../session-state';
import { VideoRecordingStatus, CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  releaseVideoCaptureSurface,
  getVideoSurfaceSession,
  cancelVideoSourceReadyWait,
} from '../capture-surface';
import {
  clearActiveVideoRecordingLease,
  updateVideoRecordingTerminal,
  getActiveVideoRecordingLeaseSnapshot,
  ensureVideoRecordingLeaseCache,
  hydrateVideoRecordingLeaseCache,
} from '../recording-control-lease';
import {
  finishVideoRecordingStop,
  isCurrentVideoRecordingId,
  resetCompletedVideoRecordingSession,
  beginVideoRecordingStop,
  getVideoRecordingCountdownSessionId,
  hasActiveVideoRecordingSession,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
  restoreVideoRecordingOffscreenStartPending,
  getVideoRecordingId,
  getVideoRecordingTabId,
  isControlledCursorCaptureEnabled,
  resetVideoRecordingStartSession,
  setVideoRecordingId,
} from '../session-state';
import { clearCameraRecorderControlGrant } from './camera-recorder-control';
import {
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
  getVideoRecordingRuntimeState,
} from './session-state';
import { type RecordingPointTransform } from '../../../../features/video/project/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { runStopSideEffects } from './manager/controls.stop/effects';
import { type StopFailureLogging } from './manager/controls.stop/failure-logging';
import {
  requestBoundOffscreenRecordingStop,
  type RecordingSourceBinding,
} from '../offscreen-recording-stop';
import { readStoredVideoPostRecordResult } from '../../../storage/video/post-record-result';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { type VideoRecordingStartFailureCode } from '@sniptale/runtime-contracts/video/types/messages.surface';

const logger = createLogger({ namespace: 'BackgroundVideoRecordingCompletion' });

const pendingStops = new Map<string, Promise<RecordingStopResult>>();

const pendingCompletions = new Map<string, Promise<void>>();

/** Joins confirmed offscreen completion and retries only unfinished background cleanup. */
export function completeVideoRecording(recordingId: string): Promise<void> {
  const pending = pendingCompletions.get(recordingId);
  if (pending) return pending;
  const work = completeRecording(recordingId)
    .catch((error: unknown) => {
      if (isCurrentVideoRecordingId(recordingId)) {
        finishVideoRecordingStop();
        publishRecordingCompletionState({
          status: VideoRecordingStatus.STOPPING,
          error: 'Recording cleanup is incomplete.',
        });
      }
      throw error;
    })
    .finally(() => {
      if (pendingCompletions.get(recordingId) === work) pendingCompletions.delete(recordingId);
    });
  pendingCompletions.set(recordingId, work);
  return work;
}

async function completeRecording(recordingId: string): Promise<void> {
  if (!isCurrentVideoRecordingId(recordingId)) return;
  const lease = await ensureActiveVideoRecordingLeaseHydrated();
  if (!isCurrentVideoRecordingId(recordingId)) return;
  if (lease?.recordingId !== recordingId || !lease.surfaceBinding) {
    throw new Error('Recording terminal source binding is unavailable.');
  }
  const binding = { recordingId, ...lease.surfaceBinding };
  const discard = lease.phase === 'terminal' ? lease.terminal.discard : false;
  const terminal =
    lease.phase === 'terminal' && lease.terminal.outcome === 'stopped'
      ? lease
      : await updateVideoRecordingTerminal(binding, {
          discard,
          outcome: 'stopped',
          cleanupStep: 'surface',
        });
  if (terminal.phase !== 'terminal' || terminal.terminal.outcome !== 'stopped') {
    throw new Error('Recording cleanup has no successful terminal outcome.');
  }
  let step = terminal.terminal.cleanupStep;
  if (!isCurrentVideoRecordingId(recordingId)) return;
  publishRecordingCompletionState({ status: VideoRecordingStatus.STOPPING, error: null });
  if (step === 'surface') {
    await releaseVideoCaptureSurface(recordingId);
    if (!isCurrentVideoRecordingId(recordingId)) return;
    await updateVideoRecordingTerminal(binding, {
      discard,
      outcome: 'stopped',
      cleanupStep: 'camera-grant',
    });
    step = 'camera-grant';
  }
  if (step === 'camera-grant') {
    await clearCameraRecorderControlGrant(recordingId);
    if (!isCurrentVideoRecordingId(recordingId)) return;
    await updateVideoRecordingTerminal(binding, {
      discard,
      outcome: 'stopped',
      cleanupStep: 'lease',
    });
  }
  if (!isCurrentVideoRecordingId(recordingId)) return;
  await clearActiveVideoRecordingLease(recordingId, { authority: 'confirmed-completion', binding });
  if (!isCurrentVideoRecordingId(recordingId)) return;
  finishVideoRecordingStop();
  resetCompletedVideoRecordingSession(recordingId);
  resetVideoRecordingRuntimeState();
}

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
    await clearActiveVideoRecordingLease(recordingId ?? undefined, {
      authority: 'cancelled-before-dispatch',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCurrentVideoRecordingId(recordingId)) {
      publishRecordingCompletionState({ error: message });
    }
    logger.error('Failed to restore capture surface after early stop', error);
    return { error: message, result: 'failed' };
  }
  if (!isCurrentVideoRecordingId(recordingId)) {
    logger.warn('Ignored stale early-stop completion after recording identity changed', {
      recordingId,
    });
    return { result: 'accepted' };
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
  failureLogging: StopFailureLogging = 'detailed',
  onGeometry?: (transform: RecordingPointTransform | null) => void
): Promise<RecordingStopResult> {
  const recordingId = getVideoRecordingId();
  const previousState = getVideoRecordingRuntimeState();
  if (!recordingId) {
    const error = 'Recording source binding is unavailable';
    finishVideoRecordingStop();
    publishRecordingCompletionState({ error });
    return { error, result: 'failed' };
  }
  const sourceBinding = await resolveRecordingSourceBinding(recordingId);
  if (!isCurrentVideoRecordingId(recordingId)) {
    logger.warn('Ignored stale stop binding after recording identity changed', { recordingId });
    return { result: 'accepted' };
  }
  if (!sourceBinding) {
    const error = 'Recording source binding is unavailable';
    finishVideoRecordingStop();
    publishRecordingCompletionState({ error });
    return { error, result: 'failed' };
  }
  publishRecordingCompletionState({
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
  let terminalError: string | null;

  try {
    const existing = getActiveVideoRecordingLeaseSnapshot();
    if (existing?.phase === 'terminal' && existing.terminal.outcome === 'stopped') {
      await completeVideoRecording(recordingId);
      return { result: 'accepted' };
    }
    if (existing?.phase === 'terminal' && existing.terminal.outcome === 'failed') {
      throw new Error('Recording cleanup failed. Local data cleanup is required.');
    }
    const intent = await updateVideoRecordingTerminal(sourceBinding, {
      discard,
      outcome: 'unknown',
      cleanupStep: 'surface',
    });
    const acknowledgement = await requestBoundOffscreenRecordingStop(
      sourceBinding,
      intent.phase === 'terminal' ? intent.terminal.discard : discard
    );
    terminalError = acknowledgement.terminalError;
    onGeometry?.(acknowledgement.recordingPointTransform);
  } catch (error) {
    return reconcileStopDeliveryFailure(recordingId, previousState, failureLogging, error);
  }

  return settleStopAcknowledgement(recordingId, sourceBinding, discard, terminalError);
}

async function reconcileStopDeliveryFailure(
  recordingId: string,
  previousState: VideoRecordingRuntimeState,
  failureLogging: StopFailureLogging,
  error: unknown
): Promise<RecordingStopResult> {
  if (await hasCommittedPostRecordResult(recordingId)) {
    if (isCurrentVideoRecordingId(recordingId)) {
      await completeVideoRecording(recordingId);
      logger.warn('Recovered committed recording completion after stop response loss', {
        recordingId,
      });
    } else {
      logger.warn('Ignored stale committed stop recovery after recording identity changed', {
        recordingId,
      });
    }
    return { result: 'accepted' };
  }
  if (!isCurrentVideoRecordingId(recordingId)) {
    logger.warn('Ignored stale stop delivery failure after recording identity changed', {
      recordingId,
    });
    return { result: 'accepted' };
  }
  const failedStopState = getVideoRecordingRuntimeState();
  finishVideoRecordingStop();
  const terminal = getActiveVideoRecordingLeaseSnapshot()?.phase === 'terminal';
  if (
    !terminal &&
    previousState.status === VideoRecordingStatus.PREPARING &&
    failedStopState.status === VideoRecordingStatus.STOPPING
  ) {
    restoreVideoRecordingOffscreenStartPending();
  }
  publishRecordingCompletionState({
    status: terminal ? VideoRecordingStatus.STOPPING : previousState.status,
    countdownEndsAt: terminal ? null : previousState.countdownEndsAt,
    error: error instanceof Error ? error.message : String(error),
  });
  if (failureLogging === 'fixed') {
    logger.error('Failed to deliver offscreen stop command during local data erasure');
  } else {
    logger.error('Failed to deliver offscreen stop command', error);
  }
  return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
}

async function settleStopAcknowledgement(
  recordingId: string,
  sourceBinding: RecordingSourceBinding,
  discard: boolean,
  terminalError: string | null
): Promise<RecordingStopResult> {
  if (!isCurrentVideoRecordingId(recordingId)) return { result: 'accepted' };
  try {
    if (terminalError !== null) {
      const lease = getActiveVideoRecordingLeaseSnapshot();
      const terminal = await updateVideoRecordingTerminal(sourceBinding, {
        discard: lease?.phase === 'terminal' ? lease.terminal.discard : discard,
        outcome: 'failed',
        cleanupStep: 'surface',
      });
      if (!isCurrentVideoRecordingId(recordingId)) return { result: 'accepted' };
      if (terminal.phase === 'terminal' && terminal.terminal.outcome === 'stopped') {
        await completeVideoRecording(recordingId);
        return { result: 'accepted' };
      }
      finishVideoRecordingStop();
      publishRecordingCompletionState({
        status: VideoRecordingStatus.STOPPING,
        error: terminalError,
      });
      return { error: terminalError, result: 'failed' };
    }
    await completeVideoRecording(recordingId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCurrentVideoRecordingId(recordingId)) {
      finishVideoRecordingStop();
      publishRecordingCompletionState({ status: VideoRecordingStatus.STOPPING, error: message });
    }
    return { error: message, result: 'failed' };
  }
  return { result: 'accepted' };
}

async function hasCommittedPostRecordResult(recordingId: string | null): Promise<boolean> {
  if (!recordingId) {
    return false;
  }
  try {
    const state = await readStoredVideoPostRecordResult();
    return (
      state?.result.recordingId === recordingId &&
      (state.status === 'ready' || state.status === 'acknowledged')
    );
  } catch (error) {
    logger.warn('Failed to reconcile post-record completion after stop delivery failure', error);
    return false;
  }
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

  const recordingId = getVideoRecordingId();
  const work = completeStopWithTelemetry(context, discard, 'detailed');
  if (!recordingId) return work;
  pendingStops.set(recordingId, work);
  try {
    return await work;
  } finally {
    if (Object.is(pendingStops.get(recordingId), work)) pendingStops.delete(recordingId);
  }
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
  return completeStopWithTelemetry(context, true, 'fixed');
}

export async function cancelRecordingStart(): Promise<RecordingStopResult> {
  if (!isRecordingStartCancellable()) {
    logger.warn('Ignoring start-cancellation request because recording start is not active');
    return { result: 'no-active-recording' };
  }

  return await stopRecording(true);
}

async function completeStopWithTelemetry(
  context: ReturnType<typeof beginVideoRecordingStop>,
  discard: boolean,
  failureLogging: StopFailureLogging
): Promise<RecordingStopResult> {
  let settleGeometry: (transform: RecordingPointTransform | null) => void = () => undefined;
  const recordingPointTransform = new Promise<RecordingPointTransform | null>((resolve) => {
    settleGeometry = resolve;
  });
  try {
    void runStopSideEffects(context, failureLogging, { discard, recordingPointTransform });
    if (context.shouldResetImmediately) return await completeEarlyStop();
    return await sendStopSignals(discard, failureLogging, settleGeometry);
  } finally {
    settleGeometry(null);
  }
}

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
  options: {
    diagnosticCode?: VideoRecordingStartFailureCode;
    recordingId?: string;
    retainAuthority?: boolean;
  } = {}
): Promise<void> {
  logger.error('Recording start failed', {
    code: options.diagnosticCode ?? 'internal-error',
  });
  const recordingId = options.recordingId ?? getVideoRecordingId();
  if (options.recordingId && !isCurrentVideoRecordingId(options.recordingId)) {
    logger.warn('Ignoring stale recording start failure', { recordingId: options.recordingId });
    return;
  }
  if (hasTerminalRecordingAuthority(recordingId)) return;
  const recordingTabId = getVideoRecordingTabId();
  // Collection ends even if restoring the capture surface fails and authority must remain.
  if (recordingTabId !== null) {
    const mode = getVideoRecordingRuntimeState().captureMode;
    if (
      isControlledCursorCaptureEnabled() ||
      mode === CaptureMode.TAB ||
      mode === CaptureMode.TAB_CROP
    ) {
      disableControlledCursorCapture(recordingTabId);
    }
  }

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

  if (hasTerminalRecordingAuthority(recordingId)) return;
  if (recordingTabId !== null) hideRecordingOverlay(recordingTabId);

  if (options.retainAuthority !== true) {
    setVideoRecordingId(null);
    resetVideoRecordingStartSession();
    resetVideoRecordingRuntimeState();
    publishRecordingCompletionState({ error });
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

function hasTerminalRecordingAuthority(recordingId: string | null | undefined): boolean {
  const lease = getActiveVideoRecordingLeaseSnapshot();
  return Boolean(
    recordingId &&
    isCurrentVideoRecordingId(recordingId) &&
    (isVideoRecordingStopInProgress() ||
      (lease?.recordingId === recordingId && lease.phase === 'terminal'))
  );
}

function projectRecordingLease(lease: VideoRecordingControlLease | null): boolean {
  if (!lease || lease !== getActiveVideoRecordingLeaseSnapshot() || lease.phase === 'prepared')
    return false;
  const currentId = getVideoRecordingId();
  if (currentId !== null && currentId !== lease.recordingId) return false;
  if (isVideoRecordingStopInProgress() && lease.phase !== 'terminal') return false;
  hydrateSessionFromLease(lease);
  return true;
}

export async function hydrateActiveVideoRecordingLease(): Promise<VideoRecordingControlLease | null> {
  const lease = await hydrateVideoRecordingLeaseCache();
  projectRecordingLease(lease);
  return lease;
}

export async function ensureActiveVideoRecordingLeaseHydrated(): Promise<VideoRecordingControlLease | null> {
  const lease = await ensureVideoRecordingLeaseCache();
  if (getVideoRecordingRuntimeState().status === VideoRecordingStatus.IDLE)
    projectRecordingLease(lease);
  return lease;
}

export async function restoreCurrentRecordingFromLease(recordingId: string): Promise<boolean> {
  const currentId = getVideoRecordingId();
  if (currentId !== null && currentId !== recordingId) return false;
  const lease = await ensureVideoRecordingLeaseCache();
  return lease?.recordingId === recordingId && projectRecordingLease(lease);
}

export function reconcileVideoRecordingLeaseOnStartup(): void {
  ensureActiveVideoRecordingLeaseHydrated().catch((error) => {
    logger.warn('Failed to hydrate active recording lease on startup', error);
  });
}

function hydrateSessionFromLease(lease: VideoRecordingControlLease): void {
  setVideoRecordingId(lease.recordingId);
  setVideoRecordingTabId(lease.recordingTabId);
  publishRecordingCompletionState({
    captureMode: lease.captureMode,
    cropRegion: lease.cropRegion,
    countdownEndsAt: null,
    error: lease.phase === 'terminal' ? 'Recording cleanup is incomplete.' : null,
    status:
      lease.phase === 'terminal' ? VideoRecordingStatus.STOPPING : VideoRecordingStatus.RECORDING,
    viewportPresetId: lease.viewportPresetId,
  } satisfies Partial<VideoRecordingRuntimeState>);
}

export async function isCurrentRecordingLifecycleEvent(
  message: { recordingId?: string },
  allowTerminal = false
): Promise<boolean> {
  if (
    !allowTerminal &&
    (isVideoRecordingStopInProgress() ||
      getActiveVideoRecordingLeaseSnapshot()?.phase === 'terminal')
  )
    return false;
  const recordingId = getVideoRecordingId();
  if (recordingId && message.recordingId === recordingId) {
    return true;
  }

  if (message.recordingId && (await restoreCurrentRecordingFromLease(message.recordingId))) {
    return allowTerminal || getActiveVideoRecordingLeaseSnapshot()?.phase !== 'terminal';
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

export function canPublishLiveRecordingState(recordingId: string | undefined): boolean {
  return (
    isCurrentVideoRecordingId(recordingId) &&
    !isVideoRecordingStopInProgress() &&
    getActiveVideoRecordingLeaseSnapshot()?.phase !== 'terminal'
  );
}

async function retainFailedRecordingCompletion(
  recordingId: string,
  phase?: 'start' | 'stop' | 'runtime' | 'export'
): Promise<void> {
  const lease = await ensureActiveVideoRecordingLeaseHydrated();
  if (!isCurrentVideoRecordingId(recordingId)) return;
  if (lease?.recordingId !== recordingId || !lease.surfaceBinding) {
    throw new Error('Recording terminal source binding is unavailable.');
  }
  if (
    phase === 'start' &&
    (isVideoRecordingStopInProgress() ||
      (lease.phase === 'terminal' && lease.terminal.outcome === 'unknown'))
  )
    return;
  const terminal = await updateVideoRecordingTerminal(
    {
      recordingId,
      ...lease.surfaceBinding,
    },
    {
      outcome: 'failed',
      cleanupStep: 'surface',
    }
  );
  if (!isCurrentVideoRecordingId(recordingId)) return;
  if (terminal.phase === 'terminal' && terminal.terminal.outcome === 'stopped') return;
  finishVideoRecordingStop();
  publishRecordingCompletionState({
    status: VideoRecordingStatus.STOPPING,
    error: 'Recording cleanup failed. Local data cleanup is required.',
  });
}

export async function handleRecordingFailure(message: {
  error?: string;
  phase?: 'start' | 'stop' | 'runtime' | 'export';
  recordingId?: string;
}): Promise<void> {
  logger.error('Offscreen error', message.error);
  if (message.phase !== 'export') {
    const currentRecordingId = getVideoRecordingId();
    if (
      (!currentRecordingId || message.recordingId !== currentRecordingId) &&
      (!message.recordingId || !(await restoreCurrentRecordingFromLease(message.recordingId)))
    ) {
      logger.warn('Ignoring stale offscreen recording error', {
        currentRecordingId,
        eventRecordingId: message.recordingId,
      });
      return;
    }

    if (
      message.recordingId &&
      (message.phase === 'stop' || hasTerminalRecordingAuthority(message.recordingId))
    ) {
      await retainFailedRecordingCompletion(message.recordingId, message.phase);
      return;
    }

    if (message.recordingId) {
      await clearCameraRecorderControlGrant(message.recordingId);
      if (!isCurrentVideoRecordingId(message.recordingId)) {
        logger.warn('Ignoring stale offscreen recording error after camera grant cleanup', {
          eventRecordingId: message.recordingId,
        });
        await clearActiveVideoRecordingLease(message.recordingId);
        return;
      }
    }
    if (message.recordingId && hasTerminalRecordingAuthority(message.recordingId)) {
      await retainFailedRecordingCompletion(message.recordingId, message.phase);
      return;
    }
    await notifyRecordingStartFailed(
      message.error || translate('background.runtime.recordingError'),
      message.recordingId ? { recordingId: message.recordingId } : undefined
    );
    if (message.recordingId && hasTerminalRecordingAuthority(message.recordingId)) {
      await retainFailedRecordingCompletion(message.recordingId, message.phase);
      return;
    }
    await clearActiveVideoRecordingLease(message.recordingId);
  }
}

/** Startup cleanup joins the accepted Stop and cannot revoke its retained failure. */
export async function stopRecordingSourceForStartFailure(
  binding: RecordingSourceBinding
): Promise<void> {
  if (!isCurrentVideoRecordingId(binding.recordingId)) return;
  const lease = await ensureVideoRecordingLeaseCache();
  if (!isCurrentVideoRecordingId(binding.recordingId)) return;
  if (
    lease?.recordingId !== binding.recordingId ||
    lease.surfaceBinding?.generation !== binding.generation ||
    lease.surfaceBinding.streamInstanceId !== binding.streamInstanceId
  ) {
    throw new Error('Recording start cleanup source changed.');
  }
  const result = await (pendingStops.get(binding.recordingId) ?? stopRecording(true));
  if (result.result === 'failed') throw new Error(result.error);
  if (result.result === 'already-stopping')
    throw new Error('Recording cleanup is still in progress.');
}

/** A legacy start continuation cannot reset an accepted Stop or a new recording. */
export function rollbackRecordingStart(recordingId: string): void {
  if (!isCurrentVideoRecordingId(recordingId) || hasTerminalRecordingAuthority(recordingId)) return;
  setVideoRecordingId(null);
  resetVideoRecordingStartSession();
  resetVideoRecordingRuntimeState();
}

/** The activation timer supplies a failure; this owner decides its cleanup. */
export async function failRecordingStartAfterTimeout(
  recordingId: string,
  error: string
): Promise<void> {
  if (!isCurrentVideoRecordingId(recordingId)) return;
  const lease = await ensureVideoRecordingLeaseCache();
  if (!isCurrentVideoRecordingId(recordingId)) return;
  if (lease?.recordingId !== recordingId || !lease.surfaceBinding) {
    throw new Error('Recording start cleanup source binding is unavailable.');
  }
  await stopRecordingSourceForStartFailure({ recordingId, ...lease.surfaceBinding });
  if (getVideoRecordingId() === null) publishRecordingCompletionState({ error });
}

/** Confirms the source outcome before recovery restores a surface. Does not restore that surface here. */
export async function confirmRecordingSourceStoppedForRecovery(
  binding: RecordingSourceBinding
): Promise<void> {
  const lease = await ensureVideoRecordingLeaseCache();
  const surface = getVideoSurfaceSession(binding.recordingId);
  const matchesLease =
    lease?.surfaceBinding?.generation === binding.generation &&
    lease.surfaceBinding.streamInstanceId === binding.streamInstanceId;
  const matchesSurface =
    surface?.generation === binding.generation &&
    surface.streamInstanceId === binding.streamInstanceId;
  if (
    lease?.recordingId !== binding.recordingId ||
    (!matchesLease && (lease.phase === 'terminal' || !matchesSurface))
  ) {
    throw new Error('Recovered recording source binding changed.');
  }
  if (lease.phase === 'terminal' && lease.terminal.outcome === 'stopped') return;
  if (lease.phase === 'terminal' && lease.terminal.outcome === 'failed') {
    throw new Error('Recording cleanup failed. The capture surface remains retained.');
  }
  const result = await requestBoundOffscreenRecordingStop(
    binding,
    lease.phase === 'terminal' ? lease.terminal.discard : true
  );
  const current = await ensureVideoRecordingLeaseCache();
  if (current?.recordingId === binding.recordingId && current.phase === 'terminal') {
    await updateVideoRecordingTerminal(binding, {
      discard: current.terminal.discard,
      outcome: result.terminalError === null ? 'stopped' : 'failed',
      cleanupStep: 'surface',
    });
  }
  if (result.terminalError !== null) throw new Error('Recording cleanup remains incomplete.');
}

/** The saved-result owner calls this after it validates and stages the durable result. */
export async function releaseSavedRecordingAuthority(recordingId: string): Promise<void> {
  await releaseVideoCaptureSurface(recordingId);
  await clearActiveVideoRecordingLease(recordingId, { authority: 'durable-saved-result' });
}

/** Publishes completion only for the identity that the saved-result owner has committed. */
export function finishSavedRecording(recordingId: string): void {
  if (!isCurrentVideoRecordingId(recordingId)) return;
  finishVideoRecordingStop();
  resetCompletedVideoRecordingSession(recordingId);
  setVideoRecordingTabId(null);
  resetVideoRecordingRuntimeState();
}

/** Projects terminal authority for consumers without granting cleanup authority. */
export function getRecordingCompletionState(): Exclude<
  VideoRecordingRuntimeState['completion'],
  undefined
> {
  const lease = getActiveVideoRecordingLeaseSnapshot();
  if (lease?.phase !== 'terminal' || !isCurrentVideoRecordingId(lease.recordingId)) return null;
  return {
    discard: lease.terminal.discard,
    outcome: lease.terminal.outcome,
    pending: isVideoRecordingStopInProgress(),
  };
}

function publishRecordingCompletionState(patch: Partial<VideoRecordingRuntimeState>): void {
  setVideoRecordingRuntimeState({ ...patch, completion: getRecordingCompletionState() });
}
