import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../../contracts/video/types/messages';
import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../../../../platform/runtime-messaging';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  finishVideoRecordingStop,
  getVideoRecordingId,
  isCurrentVideoRecordingId,
  resetCompletedVideoRecordingSession,
} from '../../../session-state';
import { loadActiveProjectExportJobLedgerEntry } from '../../../../../../composition/persistence/export-ledger';
import {
  clearActiveVideoRecordingLease,
  restoreCurrentRecordingFromLease,
} from '../../../recording-control-lease';
import { resetVideoRecordingRuntimeState } from '../../session-state';
import {
  notifyRecordingStartFailed,
  getRecordingTabId,
  resetRecordingTabId,
  finalizeRecordingDiagnostics,
} from '../../manager';
import { browserAction } from '@sniptale/platform/browser/action';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { clearRecordingStartActivationWatchdog } from '../../../manager/start-activation-watchdog';
import { markOffscreenDocumentReady } from '../../../../../offscreen-document/service';
import { releaseVideoCaptureSurface } from '../../../capture-surface';
import {
  commitPendingVideoPostRecordResult,
  persistPendingVideoPostRecordResult,
  readStoredVideoPostRecordResult,
  type StoredVideoPostRecordResult,
  type VideoPostRecordResultStatus,
} from '../../../../../storage/video/post-record-result';
import { clearCameraRecorderControlGrant } from '../../camera-recorder-control';
import { acquireMediaMutationPermit } from '../../../../../mutation-exclusion/media-activity';
import { removeVideoRecordingCompletionOutbox } from '../../../../../../composition/persistence/recordings/completion-outbox';
import {
  createAsyncLifecycleRoute,
  createAsyncLifecycleOutcomeRoute,
  HANDLED_SYNC_RESULT,
  UNHANDLED_RESULT,
  shouldNotifyRecordingFailure,
  type RouteResult,
} from '../shared';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });
type SavedRecordingOutcome = 'accepted' | 'discarded' | 'superseded';

type SavedRecordingMessage = {
  projectId?: string;
  primaryRecordingId: string;
  recordingId: string;
};

type SavedRecordingOperation = {
  message: SavedRecordingMessage;
  promise: Promise<SavedRecordingOutcome>;
};

const savedRecordingOperations = new Map<string, SavedRecordingOperation>();

export function handleOffscreenError(
  message: {
    error?: string;
    phase?: 'start' | 'stop' | 'runtime' | 'export';
    recordingId?: string;
  },
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleOffscreenErrorAsync(message),
    sendResponse,
    logger,
    'Failed to process offscreen error lifecycle event'
  );
}

async function handleOffscreenErrorAsync(message: {
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
    if (shouldNotifyRecordingFailure(message.phase)) {
      clearRecordingStartActivationWatchdog(message.recordingId);
      await notifyRecordingStartFailed(
        message.error || translate('background.runtime.recordingError'),
        message.recordingId ? { recordingId: message.recordingId } : undefined
      );
      await clearActiveVideoRecordingLease(message.recordingId);
      return;
    }

    await releaseVideoCaptureSurface(message.recordingId);
    if (message.recordingId && !isCurrentVideoRecordingId(message.recordingId)) {
      logger.warn('Ignoring stale offscreen stop error after surface cleanup', {
        eventRecordingId: message.recordingId,
      });
      await clearActiveVideoRecordingLease(message.recordingId);
      return;
    }
    finishVideoRecordingStop();
    resetCompletedVideoRecordingSession(message.recordingId);
    resetRecordingTabId();
    resetVideoRecordingRuntimeState();
    await clearActiveVideoRecordingLease(message.recordingId);
  }
}

export function handleVideoSavedToIdb(
  message: {
    projectId?: string;
    primaryRecordingId: string;
    recordingId: string;
  },
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleOutcomeRoute(
    handleVideoSavedToIdbAsync(message),
    sendResponse,
    logger,
    'Failed to process saved recording lifecycle event'
  );
}

async function handleVideoSavedToIdbAsync(message: {
  projectId?: string;
  primaryRecordingId: string;
  recordingId: string;
}): Promise<SavedRecordingOutcome> {
  const existingOperation = savedRecordingOperations.get(message.recordingId);
  if (existingOperation) {
    return isSameSavedRecordingMessage(existingOperation.message, message)
      ? await existingOperation.promise
      : 'superseded';
  }

  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) {
    logger.warn('Ignoring saved recording notification during privacy erasure', {
      recordingId: message.recordingId,
    });
    return 'discarded';
  }
  const operation = processVideoSavedToIdb(message).finally(releaseMutationPermit);
  const trackedOperation = { message, promise: operation };
  savedRecordingOperations.set(message.recordingId, trackedOperation);
  try {
    return await operation;
  } finally {
    if (savedRecordingOperations.get(message.recordingId) === trackedOperation) {
      savedRecordingOperations.delete(message.recordingId);
    }
  }
}

function isSameSavedRecordingMessage(
  left: SavedRecordingMessage,
  right: SavedRecordingMessage
): boolean {
  return (
    left.primaryRecordingId === right.primaryRecordingId &&
    (left.projectId ?? null) === (right.projectId ?? null) &&
    left.recordingId === right.recordingId
  );
}

async function processVideoSavedToIdb(
  message: SavedRecordingMessage
): Promise<SavedRecordingOutcome> {
  const existingState = await readStoredVideoPostRecordResult();
  if (isCompletedPostRecordReplay(existingState, message)) {
    await consumeRecordingCompletionOutbox(message, false);
    await openPostRecordPopup();
    finalizeSavedRecordingCompletion(message);
    return 'accepted';
  }

  if (!(await authorizeSavedRecordingCompletion(message, existingState))) {
    return 'superseded';
  }

  const synchronized = await synchronizePostRecordResult(message);
  if (synchronized === 'ready' || synchronized === 'acknowledged') {
    await consumeRecordingCompletionOutbox(message, false);
    await openPostRecordPopup();
    finalizeSavedRecordingCompletion(message);
    return 'accepted';
  }
  await completeSavedRecordingPersistence(message.recordingId);
  await consumeRecordingCompletionOutbox(message, true);
  await openPostRecordPopup();
  finalizeSavedRecordingCompletion(message);
  return 'accepted';
}

async function openPostRecordPopup(): Promise<void> {
  const tabId = getRecordingTabId();
  if (tabId === null) return;
  try {
    const tab = await browserTabs.get(tabId);
    if (typeof tab.windowId === 'number') {
      await browserWindows.update(tab.windowId, { focused: true });
      await browserAction.openPopup({ windowId: tab.windowId });
    }
  } catch (error) {
    logger.warn('Failed to open the video post-record popup', error);
  }
}

function toPostRecordResult(message: SavedRecordingMessage) {
  return {
    primaryRecordingId: message.primaryRecordingId,
    projectId: message.projectId ?? null,
    recordingId: message.recordingId,
  };
}

async function consumeRecordingCompletionOutbox(
  message: SavedRecordingMessage,
  required: boolean
): Promise<void> {
  const expected = toPostRecordResult(message);
  if (!(await removeVideoRecordingCompletionOutbox(expected)) && required) {
    throw new Error('The durable recording completion outbox could not be consumed.');
  }
}

function isCompletedPostRecordReplay(
  state: StoredVideoPostRecordResult | null,
  message: SavedRecordingMessage
): boolean {
  return (
    isExactPostRecordState(state, message) &&
    (state.status === 'ready' || state.status === 'acknowledged')
  );
}

async function authorizeSavedRecordingCompletion(
  message: SavedRecordingMessage,
  existingState: StoredVideoPostRecordResult | null
): Promise<boolean> {
  const currentRecordingId = getVideoRecordingId();
  const authorized =
    (currentRecordingId !== null && message.recordingId === currentRecordingId) ||
    (isExactPostRecordState(existingState, message) && existingState.status === 'staged') ||
    (await restoreCurrentRecordingFromLease(message.recordingId));
  if (!authorized) {
    logger.warn('Ignoring stale saved recording notification', {
      currentRecordingId,
      eventRecordingId: message.recordingId,
    });
  }
  return authorized;
}

async function completeSavedRecordingPersistence(recordingId: string): Promise<void> {
  await releaseVideoCaptureSurface(recordingId);
  await clearActiveVideoRecordingLease(recordingId);
  const committed = await commitPendingVideoPostRecordResult(recordingId);
  if (committed !== 'ready' && committed !== 'acknowledged') {
    throw new Error('The post-record result could not be committed after terminal cleanup.');
  }
}

function finalizeSavedRecordingCompletion(message: SavedRecordingMessage): void {
  if (getVideoRecordingId() !== message.recordingId) {
    void finalizeRecordingDiagnostics(message.recordingId);
    return;
  }

  finishVideoRecordingStop();
  resetCompletedVideoRecordingSession(message.recordingId);
  resetRecordingTabId();
  resetVideoRecordingRuntimeState();
  void finalizeRecordingDiagnostics(message.recordingId);
}

function isExactPostRecordState(
  state: StoredVideoPostRecordResult | null,
  message: SavedRecordingMessage
): state is StoredVideoPostRecordResult {
  return (
    state !== null &&
    state.result.primaryRecordingId === message.primaryRecordingId &&
    state.result.projectId === (message.projectId ?? null) &&
    state.result.recordingId === message.recordingId
  );
}

async function synchronizePostRecordResult(
  message: SavedRecordingMessage
): Promise<VideoPostRecordResultStatus> {
  return persistPendingVideoPostRecordResult({
    primaryRecordingId: message.primaryRecordingId,
    projectId: message.projectId ?? null,
    recordingId: message.recordingId,
  });
}

export function handleOffscreenReady(
  message: {
    offscreenStartupId: string;
    type: typeof VideoMessageType.OFFSCREEN_READY;
  },
  sendResponse: ResponseSender
): RouteResult {
  logger.log('OFFSCREEN_READY received');
  const accepted = markOffscreenDocumentReady(message.offscreenStartupId);
  sendResponse({ success: true, result: accepted ? 'accepted' : 'stale' });
  return HANDLED_SYNC_RESULT;
}

export function handleInternalVideoSignal(sendResponse: ResponseSender): RouteResult {
  sendResponse({ success: true, result: 'accepted' });
  return HANDLED_SYNC_RESULT;
}

type ProjectExportLifecycleMessage = Extract<
  VideoRuntimeMessage,
  {
    type:
      | typeof VideoMessageType.PROJECT_EXPORT_CANCELLED
      | typeof VideoMessageType.PROJECT_EXPORT_COMPLETED
      | typeof VideoMessageType.PROJECT_EXPORT_FAILED
      | typeof VideoMessageType.PROJECT_EXPORT_PROGRESS;
  }
>;

export function handleProjectExportLifecycleMessage(
  message: ProjectExportLifecycleMessage,
  sendResponse: ResponseSender
): RouteResult {
  if (message.targetDocumentId && message.targetSenderUrl) {
    sendResponse({ success: true, result: 'accepted' });
    return HANDLED_SYNC_RESULT;
  }

  return createAsyncLifecycleRoute(
    forwardProjectExportLifecycleMessage(message),
    sendResponse,
    logger,
    'Failed to route project export lifecycle event'
  );
}

async function forwardProjectExportLifecycleMessage(
  message: ProjectExportLifecycleMessage
): Promise<void> {
  const ledger = await loadActiveProjectExportJobLedgerEntry();
  if (
    !ledger ||
    ledger.jobId !== message.jobId ||
    !ledger.ownerDocumentId ||
    !ledger.ownerSenderUrl
  ) {
    logger.warn('Ignoring project export lifecycle event without an active owner', {
      jobId: message.jobId,
    });
    return;
  }

  await sendRuntimeMessage({
    ...message,
    targetDocumentId: ledger.ownerDocumentId,
    targetSenderUrl: ledger.ownerSenderUrl,
  });
}

export function createUnhandledRouteResult(): RouteResult {
  return UNHANDLED_RESULT;
}
