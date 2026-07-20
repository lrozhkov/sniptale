import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../../contracts/video/types/messages';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import { openVideoEditorPage } from '../../../../../../platform/navigation/extension-pages';
import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../../../../platform/runtime-messaging';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  finishVideoRecordingStop,
  getVideoRecordingId,
  resetCompletedVideoRecordingSession,
  shouldOpenVideoEditorAfterRecording,
} from '../../../session-state';
import { loadActiveProjectExportJobLedgerEntry } from '../../../../../../composition/persistence/export-ledger';
import {
  clearActiveVideoRecordingLease,
  restoreCurrentRecordingFromLease,
} from '../../../recording-control-lease';
import { resetVideoRecordingRuntimeState } from '../../session-state';
import {
  notifyRecordingStartFailed,
  resetRecordingTabId,
  finalizeRecordingDiagnostics,
} from '../../manager';
import { waitForStopSideEffects } from '../../manager/controls.stop/effects';
import { clearRecordingStartActivationWatchdog } from '../../../manager/start-activation-watchdog';
import { markOffscreenDocumentReady } from '../../offscreen-manager';
import {
  createAsyncLifecycleRoute,
  HANDLED_SYNC_RESULT,
  UNHANDLED_RESULT,
  shouldNotifyRecordingStartFailure,
  type RouteResult,
} from '../shared';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });
const processingSavedRecordingIds = new Set<string>();

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

    if (shouldNotifyRecordingStartFailure(message.phase)) {
      clearRecordingStartActivationWatchdog(message.recordingId);
      notifyRecordingStartFailed(message.error || translate('background.runtime.recordingError'));
      await clearActiveVideoRecordingLease(message.recordingId);
      return;
    }

    finishVideoRecordingStop();
    resetCompletedVideoRecordingSession(message.recordingId);
    resetRecordingTabId();
    resetVideoRecordingRuntimeState();
    await clearActiveVideoRecordingLease(message.recordingId);
  }

  if (!shouldNotifyRecordingStartFailure(message.phase)) {
    return;
  }

  runBestEffort(
    sendRuntimeMessage({
      type: VideoMessageType.RECORDING_START_FAILED,
      error: message.error || translate('background.runtime.recordingError'),
    }),
    logger,
    'Failed to forward offscreen error to runtime transport'
  );
}

export function handleVideoSavedToIdb(
  message: {
    projectId?: string;
    recordingId: string;
  },
  sendResponse: ResponseSender
): RouteResult {
  return createAsyncLifecycleRoute(
    handleVideoSavedToIdbAsync(message),
    sendResponse,
    logger,
    'Failed to process saved recording lifecycle event'
  );
}

async function handleVideoSavedToIdbAsync(message: {
  projectId?: string;
  recordingId: string;
}): Promise<void> {
  if (!beginSavedRecordingNotification(message.recordingId)) {
    logger.warn('Ignoring duplicate saved recording notification', {
      eventRecordingId: message.recordingId,
    });
    return;
  }

  try {
    const currentRecordingId = getVideoRecordingId();
    if (
      (!currentRecordingId || message.recordingId !== currentRecordingId) &&
      !(await restoreCurrentRecordingFromLease(message.recordingId))
    ) {
      logger.warn('Ignoring stale saved recording notification', {
        currentRecordingId,
        eventRecordingId: message.recordingId,
      });
      return;
    }

    const shouldOpenEditor = shouldOpenVideoEditorAfterRecording();
    finishVideoRecordingStop();
    resetCompletedVideoRecordingSession(message.recordingId);
    resetRecordingTabId();
    resetVideoRecordingRuntimeState();
    await clearActiveVideoRecordingLease(message.recordingId);
    void finalizeRecordingDiagnostics(message.recordingId);
    if (message.recordingId && shouldOpenEditor) {
      runBestEffort(
        waitForStopSideEffects().then(() =>
          openVideoEditorPage(
            message.projectId ?? null,
            message.projectId ? null : message.recordingId
          )
        ),
        logger,
        'Failed to open video editor after recording save',
        { projectId: message.projectId ?? null, recordingId: message.recordingId }
      );
    }
  } finally {
    finishSavedRecordingNotification(message.recordingId);
  }
}

function beginSavedRecordingNotification(recordingId: string): boolean {
  if (processingSavedRecordingIds.has(recordingId)) {
    return false;
  }

  processingSavedRecordingIds.add(recordingId);
  return true;
}

function finishSavedRecordingNotification(recordingId: string): void {
  processingSavedRecordingIds.delete(recordingId);
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
