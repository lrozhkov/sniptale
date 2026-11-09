import {
  matchesRecordingFrameClockBinding,
  type RecordingClockTiming,
} from '../../contracts/video/recording-frame-clock';
import {
  OFFSCREEN_RECORDING_START_TIMEOUT_MS,
  RECORDING_SOURCE_PREPARATION_TIMEOUT_MS,
  RECORDING_START_DELIVERY_TIMEOUT_MS,
} from '@sniptale/runtime-contracts/video/types/timeouts';
import { reserveRecordingBegin, cancelRecordingBegin } from './start/gate';
import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { recordingContext, type RecordingStopOutcome } from './context';
import { createBrowserRecordingEventsWriter } from './recording-events/writer';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import { createBrowserCursorTrajectoryWriter } from './cursor-trajectory/writer';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { cleanupResources } from './start/cleanup';
import { startRecording as startRecordingImpl } from './start/index';
import { RecordingStartCleanupConfirmedError } from './start/error-reporting';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RecordingFrameClockAnchor } from '../../contracts/video/recording-frame-clock';
import {
  hasActiveSidecarSession,
  pauseActiveSidecarRecorders,
  resumeActiveSidecarRecorders,
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
import {
  PostRecordPublicationError,
  retryPendingPostRecordResult,
} from './post-record-publication';
import {
  acquireVideoRecordingMediaActivityLease,
  releaseVideoRecordingMediaActivityLease,
} from '../media-activity/video-recording-lease';

const logger = createLogger({ namespace: 'OffscreenRecordingController' });
const runtimeMessaging = createRuntimeMessagingTransport();
const STOP_RECORDING_TIMEOUT_MS = 10_000;
let pendingRecordingStart: Promise<void> | null = null;
let pendingRecordingStop: Promise<RecordingStopOutcome> | null = null;
let activeRecordingBinding: RecordingSourceBinding | null = null;
let terminalRecording: { binding: RecordingSourceBinding; outcome: RecordingStopOutcome } | null =
  null;
let cursorTrajectory: {
  binding: RecordingSourceBinding;
  writer: Awaited<ReturnType<typeof createBrowserCursorTrajectoryWriter>>;
} | null = null;

type EventsWriter = Awaited<ReturnType<typeof createBrowserRecordingEventsWriter>>;
let recordingEvents: {
  binding: RecordingSourceBinding;
  writer: Promise<EventsWriter> | null;
  create(): Promise<EventsWriter>;
} | null = null;

/** Accepts only the current recording's browser document after background authorization. */
export async function appendRecordingEventObservations(
  binding: RecordingSourceBinding,
  packet: unknown,
  nativeDocumentId: string
): Promise<void> {
  assertActiveRecordingBinding(binding);
  const source = recordingEvents;
  if (!source || !matchesRecordingFrameClockBinding(binding, source.binding))
    throw new Error('Event recording source is unavailable');
  source.writer ??= source.create();
  const writer = await source.writer;
  if (!matchesActiveRecordingBinding(binding) || recordingEvents !== source) {
    await writer.discard();
    throw new Error('Event recording binding is unavailable');
  }
  await writer.append(packet, nativeDocumentId);
}

export async function appendRecordingCursorObservations(
  binding: RecordingSourceBinding,
  packet: unknown,
  nativeDocumentId: string
): Promise<void> {
  assertActiveRecordingBinding(binding);
  if (!cursorTrajectory || !matchesRecordingFrameClockBinding(binding, cursorTrajectory.binding))
    throw new Error('Cursor recording source is unavailable');
  await cursorTrajectory.writer.append(packet, nativeDocumentId);
}
let pendingDataPreparation: {
  binding: RecordingSourceBinding;
  abort: AbortController;
  cancelled: boolean;
} | null = null;

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

export function startRecording(
  params: Parameters<typeof startRecordingImpl>[0],
  prepareData?: () => Promise<void>
): Promise<void> {
  if (terminalRecording?.outcome.result === 'terminal-failure') {
    return Promise.reject(new Error('Recording cleanup failed. Local data cleanup is required.'));
  }
  if (pendingRecordingStart || pendingRecordingStop || hasActiveRecordingSession()) {
    return Promise.reject(new Error(translate('background.runtime.recordingAlreadyRunning')));
  }

  releaseVideoRecordingMediaActivityLease();
  const acquisition = acquireVideoRecordingMediaActivityLease();
  if (!acquisition.acquired) {
    return Promise.reject(new Error(`Offscreen media activity is busy: ${acquisition.busyOwner}`));
  }

  const previousBinding = activeRecordingBinding;
  const binding = {
    generation: params.generation,
    recordingId: params.recordingId,
    streamInstanceId: params.streamInstanceId,
  };
  activeRecordingBinding = binding;
  terminalRecording = null;
  const work = startRecordingAfterPendingPublication(params, binding, previousBinding, prepareData);
  const tracked = work.finally(() => {
    if (pendingRecordingStart === tracked) {
      pendingRecordingStart = null;
    }
    if (!hasActiveRecordingSession()) releaseVideoRecordingMediaActivityLease();
  });
  pendingRecordingStart = tracked;
  return tracked;
}

async function startRecordingAfterPendingPublication(
  params: Parameters<typeof startRecordingImpl>[0],
  binding: RecordingSourceBinding,
  previousBinding: RecordingSourceBinding | null,
  prepareData?: () => Promise<void>
): Promise<void> {
  let previousBindingRetired = false;
  try {
    if (prepareData && !(await prepareRecordingData(params, binding, prepareData))) return;
    if (previousBinding) {
      previousBindingRetired =
        await reconcilePendingPostRecordPublicationBeforeStart(previousBinding);
    }
    if ((params.settings?.sourceCount ?? 1) > 1) {
      await startMultiSourceRecording(
        {
          generation: params.generation,
          recordingId: params.recordingId ?? `rec-${Date.now()}`,
          streamInstanceId: params.streamInstanceId,
          settings: {
            ...params.settings,
            systemAudioEnabled: false,
          },
        },
        runtimeMessaging
      );
    } else {
      await startRecordingImpl(params, runtimeMessaging, async (width, height, observation) => {
        if (!matchesActiveRecordingBinding(binding)) return;
        recordingEvents = {
          binding: { ...binding },
          writer: null,
          create: () =>
            createBrowserRecordingEventsWriter({
              recordingId: params.recordingId,
              eventStreamId: crypto.randomUUID().replaceAll('-', ''),
              width,
              height,
              store: createRecordingEventsStore({
                database: () => initDB(),
                mintGeneration: () => crypto.randomUUID(),
              }),
              pointTransform: () =>
                observation.stable && observation.sawFrame ? observation.transform : null,
            }),
        };
        try {
          const writer = await createBrowserCursorTrajectoryWriter({
            recordingId: params.recordingId,
            trajectoryId: crypto.randomUUID().replaceAll('-', ''),
            width,
            height,
            store: createRecordingCursorTrajectoryStore({
              database: () => initDB(),
              mintGeneration: () => crypto.randomUUID(),
            }),
            pointTransform: () =>
              observation.stable && observation.sawFrame ? observation.transform : null,
          });
          if (!matchesActiveRecordingBinding(binding)) {
            await writer.discard();
            return;
          }
          cursorTrajectory = { binding: { ...binding }, writer };
        } catch {
          logger.warn('Cursor trajectory initialization failed');
        }
      });
    }
    if (
      !pendingRecordingStop &&
      !hasActiveRecordingSession() &&
      matchesActiveRecordingBinding(binding)
    ) {
      activeRecordingBinding = null;
    }
  } catch (error) {
    if (prepareData) cancelRecordingBegin();
    if (!pendingRecordingStop && matchesActiveRecordingBinding(binding)) {
      if (
        error instanceof RecordingStartCleanupConfirmedError &&
        matchesRecordingFrameClockBinding(error.binding, binding) &&
        !hasActiveRecordingSession() &&
        recordingContext.currentRecordingId === null &&
        (!terminalRecording ||
          !matchesRecordingFrameClockBinding(terminalRecording.binding, binding))
      )
        terminalRecording = { binding: { ...binding }, outcome: { result: 'stopped' } };
      activeRecordingBinding = previousBindingRetired ? null : previousBinding;
    }
    throw error;
  }
}

async function prepareRecordingData(
  params: Parameters<typeof startRecordingImpl>[0],
  binding: RecordingSourceBinding,
  prepareData: () => Promise<void>
): Promise<boolean> {
  const preparation = { binding, abort: new AbortController(), cancelled: false };
  pendingDataPreparation = preparation;
  const timeoutMs =
    OFFSCREEN_RECORDING_START_TIMEOUT_MS +
    Math.max(0, params.settings.countdownSeconds ?? 0) * 1000;
  const timeout = setTimeout(
    () => preparation.abort.abort(new Error('Recording data preparation timed out')),
    timeoutMs
  );
  const aborted = new Promise<never>((_, reject) => {
    preparation.abort.signal.addEventListener(
      'abort',
      () => reject(preparation.abort.signal.reason),
      { once: true }
    );
  });
  try {
    const begin = reserveRecordingBegin(
      binding,
      RECORDING_SOURCE_PREPARATION_TIMEOUT_MS +
        RECORDING_START_DELIVERY_TIMEOUT_MS +
        Math.max(0, params.settings.countdownSeconds ?? 0) * 1000
    );
    void begin.catch((error) => preparation.abort.abort(error));
    await Promise.race([prepareData(), aborted]);
    return !preparation.cancelled && matchesActiveRecordingBinding(binding);
  } catch (error) {
    cancelRecordingBegin();
    if (preparation.cancelled) return false;
    throw error;
  } finally {
    clearTimeout(timeout);
    if (pendingDataPreparation === preparation) pendingDataPreparation = null;
    if (preparation.cancelled && matchesActiveRecordingBinding(binding))
      activeRecordingBinding = null;
  }
}

async function reconcilePendingPostRecordPublicationBeforeStart(
  previousBinding: RecordingSourceBinding | null
): Promise<boolean> {
  if (
    !previousBinding ||
    !(await retryPendingPostRecordResult(previousBinding.recordingId, runtimeMessaging))
  ) {
    return false;
  }
  notifyRecordingStoppedBestEffort(
    'post-record-publication-reconciled-before-start',
    previousBinding.recordingId
  );
  return true;
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

async function waitForExistingArtifactStop(): Promise<RecordingStopOutcome> {
  const artifactSession = recordingContext.artifactSession;
  if (!artifactSession) {
    return handleStopWithoutActiveRecorder(hasActiveRecordingSession());
  }
  try {
    await artifactSession.stop();
    return { result: 'stopped' };
  } catch (error) {
    if (error instanceof PostRecordPublicationError) throw error;
    return {
      error: error instanceof Error ? error.message : String(error),
      result: 'terminal-failure',
    };
  }
}

async function stopActiveRecording(
  discard: boolean,
  stopRequested: boolean
): Promise<RecordingStopOutcome> {
  const retriedPublicationRecordingId = await retryPostRecordPublication(stopRequested);
  if (retriedPublicationRecordingId) {
    notifyRecordingStoppedBestEffort(
      'post-record-publication-retried',
      retriedPublicationRecordingId
    );
    return { result: 'stopped' };
  }

  if (hasActiveMultiSourceRecording()) {
    await stopMultiSourceRecording(discard);
    return { result: 'stopped' };
  }

  if (recordingContext.lifecycleState === 'starting') {
    recordingContext.discardOnStop = discard;
    const recordingId = recordingContext.currentRecordingId;
    const hadActiveSession = hasActiveRecordingSession();
    recordingContext.cancelStartingRecorder();
    cleanupResources();
    if (hadActiveSession) {
      notifyRecordingStoppedBestEffort('stop-request-before-recorder-activation', recordingId);
    }
    return { result: 'stopped' };
  }

  if (recordingContext.lifecycleState === 'stopping') {
    return waitForExistingArtifactStop();
  }

  const { artifactSession, durationTracker, recordingPointObservation } = recordingContext;
  const hadActiveSession = hasActiveRecordingSession();
  if (!artifactSession || artifactSession.state === 'inactive') {
    return handleStopWithoutActiveRecorder(hadActiveSession);
  }

  return new Promise((resolve, reject) => {
    logger.debug('Stopping recording');
    publishFinalRecordingDuration(durationTracker);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const clearRecorderTerminalDeadline = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    timeoutId = setTimeout(() => {
      clearRecorderTerminalDeadline();
      const pendingStopRequest = clearPendingStopRequest();
      if (!pendingStopRequest.reject) {
        return;
      }

      const error = translate('background.runtime.recordingStopTimeout');
      void artifactSession.abort().catch(() => undefined);
      cleanupResources();
      pendingStopRequest.resolve?.({ error, result: 'terminal-failure' });
    }, STOP_RECORDING_TIMEOUT_MS);

    recordingContext.beginStopRequest({
      discard,
      resolve: (outcome = { result: 'stopped' }) => {
        clearRecorderTerminalDeadline();
        clearPendingStopRequest();
        resolve(
          outcome.result === 'stopped'
            ? {
                ...outcome,
                recordingPointTransform:
                  !discard &&
                  recordingPointObservation?.sawFrame &&
                  recordingPointObservation.stable
                    ? recordingPointObservation.transform
                    : null,
              }
            : outcome
        );
      },
      reject: (error) => {
        clearRecorderTerminalDeadline();
        clearPendingStopRequest();
        if (error instanceof PostRecordPublicationError) {
          reject(error);
          return;
        }
        resolve({
          error: error instanceof Error ? error.message : String(error),
          result: 'terminal-failure',
        });
      },
    });
    recordingContext.registerArtifactFinalizingHandler(clearRecorderTerminalDeadline);

    void artifactSession.stop().catch((error: unknown) => {
      clearRecorderTerminalDeadline();
      const pendingStopRequest = clearPendingStopRequest();
      if (!pendingStopRequest.resolve && !pendingStopRequest.reject) return;
      cleanupResources();
      if (error instanceof PostRecordPublicationError) {
        pendingStopRequest.reject?.(error);
        return;
      }
      pendingStopRequest.resolve?.({
        error: error instanceof Error ? error.message : String(error),
        result: 'terminal-failure',
      });
    });
  });
}

async function retryPostRecordPublication(stopRequested: boolean): Promise<string | null> {
  if (!stopRequested) {
    return null;
  }
  const recordingId = activeRecordingBinding?.recordingId;
  if (!recordingId || !(await retryPendingPostRecordResult(recordingId, runtimeMessaging))) {
    return null;
  }
  return recordingId;
}

export function stopRecording(
  binding: RecordingSourceBinding,
  discard = false
): Promise<RecordingStopOutcome> {
  if (
    terminalRecording &&
    matchesRecordingFrameClockBinding(terminalRecording.binding, binding) &&
    (!activeRecordingBinding || matchesActiveRecordingBinding(binding))
  ) {
    return Promise.resolve(terminalRecording.outcome);
  }
  try {
    assertActiveRecordingBinding(binding);
  } catch (error) {
    return Promise.reject(error);
  }
  if (pendingDataPreparation && matchesActiveRecordingBinding(binding)) {
    pendingDataPreparation.cancelled = true;
    pendingDataPreparation.abort.abort(new Error('Recording preparation cancelled'));
    cancelRecordingBegin();
    const outcome: RecordingStopOutcome = { result: 'stopped' };
    terminalRecording = { binding: { ...binding }, outcome };
    return Promise.resolve(outcome);
  }
  if (pendingRecordingStop) {
    return pendingRecordingStop;
  }

  const stoppedWhilePaused = recordingContext.artifactSession?.state === 'paused';
  const work = stopRecordingOnce(discard)
    .then(async (outcome): Promise<RecordingStopOutcome> => {
      const cursor = cursorTrajectory;
      if (cursor && matchesRecordingFrameClockBinding(cursor.binding, binding)) {
        try {
          if (discard) await cursor.writer.discard();
          else {
            const descriptor = await cursor.writer.finish({
              waitForSourceStop: outcome.result === 'stopped',
              stoppedWhilePaused,
            });
            if (outcome.result === 'stopped')
              outcome = { ...outcome, cursorTrajectory: descriptor };
          }
          if (cursorTrajectory === cursor) cursorTrajectory = null;
        } catch (error) {
          if (discard) throw error;
          logger.warn('Cursor trajectory finalization failed; stored prefix retained');
        }
      }
      const events = recordingEvents;
      if (events && matchesRecordingFrameClockBinding(events.binding, binding)) {
        try {
          if (events.writer) {
            const writer = await events.writer;
            if (discard) await writer.discard();
            else {
              const descriptor = await writer.finish({
                waitForSourceStop: outcome.result === 'stopped',
                stoppedWhilePaused,
              });
              if (outcome.result === 'stopped')
                outcome = { ...outcome, recordingEvents: descriptor };
            }
          }
        } catch (error) {
          if (discard) throw error;
          logger.warn('Event finalization failed; stored prefix retained');
        } finally {
          if (recordingEvents === events) recordingEvents = null;
        }
      }
      if (outcome.result === 'stopped' || !hasActiveRecordingSession())
        activeRecordingBinding = null;
      return outcome;
    })
    .catch((error: unknown): RecordingStopOutcome => {
      if (error instanceof PostRecordPublicationError) throw error;
      return { result: 'terminal-failure', error: 'Recording cleanup failed.' };
    })
    .then((outcome) => {
      terminalRecording = { binding: { ...binding }, outcome };
      return outcome;
    });
  const tracked = work.finally(() => {
    if (pendingRecordingStop === tracked) {
      pendingRecordingStop = null;
    }
    if (!hasActiveRecordingSession()) releaseVideoRecordingMediaActivityLease();
  });
  pendingRecordingStop = tracked;
  return tracked;
}

async function stopRecordingOnce(discard: boolean): Promise<RecordingStopOutcome> {
  const pendingStart = pendingRecordingStart;
  cancelPendingMultiSourceRecordingStart();
  let outcome = await stopActiveRecording(discard, true);
  if (!pendingStart) {
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
  outcome = await stopActiveRecording(discard, true);
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
  recordingId: string | null,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  if (!recordingId) return;
  sendRuntimeMessageBestEffort({
    context: { recordingId },
    logger,
    logMessage: `Failed to notify runtime that recording ${action}`,
    payload: { type, recordingId, ...(frameClock === undefined ? {} : { frameClock }) },
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

function assertActiveRecordingBinding(binding: RecordingSourceBinding): void {
  if (!activeRecordingBinding) {
    if (recordingContext.matchesSourceBinding(binding)) return;
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

  const { artifactSession, durationTracker } = recordingContext;
  if (!artifactSession || artifactSession.state !== 'recording') {
    logger.debug('Pause requested while recording is not active');
    return;
  }

  logger.debug('Pausing recording');
  artifactSession.pause();
  recordingContext.pauseMicrophoneObservation();
  pauseActiveSidecarRecorders();
  durationTracker.freeze();
  durationTracker.stopSegment();
  durationTracker.publishDuration();

  notifyState(
    VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    'paused',
    recordingContext.currentRecordingId,
    artifactSession.frameClock
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

  const { artifactSession, durationTracker } = recordingContext;
  if (!artifactSession || artifactSession.state !== 'paused') {
    logger.debug('Resume requested while recording is not paused');
    return;
  }

  logger.debug('Resuming recording');
  artifactSession.resume();
  recordingContext.resumeMicrophoneObservation();
  resumeActiveSidecarRecorders();
  durationTracker.startSegment();

  if (artifactSession.frameClock === undefined) {
    notifyState(
      VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
      'resumed',
      recordingContext.currentRecordingId
    );
  }
}

export function updateRecordingSettings(
  binding: RecordingSourceBinding,
  patch: Parameters<typeof applyRecordingSettings>[0]
): Promise<void> {
  assertActiveRecordingBinding(binding);
  return applyRecordingSettings(patch);
}

/** Read-only timestamps; source lifecycle and command authority remain unchanged. */
export function getRecordingClockTiming(
  binding: RecordingSourceBinding
): RecordingClockTiming | null {
  const receivedAtMs = performance.timeOrigin + performance.now();
  if (!matchesActiveRecordingBinding(binding) || !recordingContext.matchesSourceBinding(binding))
    return null;
  const anchor = recordingContext.artifactSession?.frameClock;
  if (!anchor || !matchesRecordingFrameClockBinding(binding, anchor)) return null;
  return {
    recordingId: binding.recordingId,
    generation: binding.generation,
    streamInstanceId: binding.streamInstanceId,
    receivedAtMs,
    repliedAtMs: performance.timeOrigin + performance.now(),
    maximumUncertaintyMs: anchor.maximumUncertaintyMs ?? 1000 / 120,
  };
}
