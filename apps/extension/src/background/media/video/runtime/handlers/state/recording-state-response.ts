import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockBinding,
} from '../../../../../../contracts/video/recording-frame-clock';
import { getRecordingFrameClock, getVideoRecordingTabId } from '../../../session-state';
import { requireActiveVideoRecordingSourceBinding } from '../../../recording-control-lease';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import type { RecordingStateHealth } from '../../../../../../contracts/messaging/contracts/response-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import {
  forgetCameraRecorderControlGrant,
  isAuthorizedCameraRecorderDocument,
  restoreAuthorizedCameraRecorderDocument,
} from '../../camera-recorder-control';
import { getActiveVideoRecordingLeaseSnapshot } from '../../../recording-control-lease';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  getRecordingCompletionState,
} from '../../recording-completion';
import {
  resolveTrustedCameraRecorderRuntimeSenderUrl,
  resolveTrustedPopupRuntimeSenderUrl,
} from '../../sender-policy';
import { getVideoRecordingRuntimeState } from '../../session-state/service/runtime-state-service';
import { HANDLED_ASYNC_RESULT, type RouteResult } from '../shared';
import {
  isAcknowledgedVideoPostRecordResultForCamera,
  readPendingVideoPostRecordResult,
} from '../../../../../storage/video/post-record-result';
import { acknowledgePendingVideoPostRecordResult } from '../../../../../storage/video/post-record-acknowledgement';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

function resolveRecordingStateHealth(state: VideoRecordingRuntimeState): RecordingStateHealth {
  return state.error ? 'degraded' : 'healthy';
}

function resolveRecordingControlCapabilityForSender(
  sender?: chrome.runtime.MessageSender
): { controlToken: string; recordingId: string } | null {
  const senderUrl = resolveTrustedPopupRuntimeSenderUrl(sender);
  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  const lease = getActiveVideoRecordingLeaseSnapshot();
  if (!lease || lease.expiresAt <= Date.now()) {
    return null;
  }

  const isOwnerSender = senderUrl !== null && lease.ownerSenderUrl === senderUrl;
  const isCameraSender =
    cameraSenderUrl !== null &&
    isAuthorizedCameraRecorderDocument({
      documentId: sender?.documentId,
      recordingId: lease.recordingId,
      senderUrl: cameraSenderUrl,
      tabId: sender?.tab?.id,
    });
  if (!isOwnerSender && !isCameraSender) {
    return null;
  }

  return { controlToken: lease.controlToken, recordingId: lease.recordingId };
}

export function handleRecordingState(
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  void sendHydratedRecordingState(sendResponse, sender).catch((error) => {
    logger.warn('Failed to hydrate recording lease before state response', error);
    sendResponse({ success: false, error: 'Internal error' });
  });
  return HANDLED_ASYNC_RESULT;
}

async function sendHydratedRecordingState(
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  const trustedPopup = resolveTrustedPopupRuntimeSenderUrl(sender) !== null;
  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  const [, candidatePostRecordResult] = await Promise.all([
    ensureActiveVideoRecordingLeaseHydrated(),
    trustedPopup || cameraSenderUrl !== null
      ? readPendingVideoPostRecordResult()
      : Promise.resolve(null),
  ]);
  const activeLease = getActiveVideoRecordingLeaseSnapshot();
  const activeRecordingId = activeLease?.recordingId;
  const hasLiveRecordingLease = activeLease !== null && activeLease.expiresAt > Date.now();
  if (cameraSenderUrl !== null && activeRecordingId !== undefined) {
    await restoreAuthorizedCameraRecorderDocument({
      documentId: sender?.documentId,
      recordingId: activeRecordingId,
      senderUrl: cameraSenderUrl,
      tabId: sender?.tab?.id,
    });
  }
  const authorizedForPostRecordResult =
    !hasLiveRecordingLease && cameraSenderUrl !== null && candidatePostRecordResult !== null
      ? await restoreAuthorizedCameraRecorderDocument({
          documentId: sender?.documentId,
          recordingId: candidatePostRecordResult.recordingId,
          senderUrl: cameraSenderUrl,
          tabId: sender?.tab?.id,
        })
      : false;
  const postRecordResult =
    !hasLiveRecordingLease &&
    candidatePostRecordResult &&
    (trustedPopup || authorizedForPostRecordResult)
      ? candidatePostRecordResult
      : null;
  sendRecordingStateResponse(sendResponse, sender, postRecordResult);
}

function sendRecordingStateResponse(
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender,
  postRecordResult: Awaited<ReturnType<typeof readPendingVideoPostRecordResult>> = null
): void {
  const recordingState: VideoRecordingRuntimeState = {
    ...getVideoRecordingRuntimeState(),
    completion: getRecordingCompletionState(),
  };
  const controlCapability = resolveRecordingControlCapabilityForSender(sender);
  sendResponse({
    success: true,
    recordingHealth: resolveRecordingStateHealth(recordingState),
    state: recordingState,
    ...(postRecordResult === null ? {} : { postRecordResult }),
    ...(controlCapability ?? {}),
  });
}

export function handleAcknowledgePostRecordResult(
  message: { recordingId: string },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  void acknowledgePostRecordResult(message, sendResponse, sender).catch((error) => {
    logger.warn('Failed to acknowledge post-record result', error);
    sendResponse({ success: false, error: 'Internal error' });
  });
  return HANDLED_ASYNC_RESULT;
}

async function acknowledgePostRecordResult(
  message: { recordingId: string },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  const popupSender = resolveTrustedPopupRuntimeSenderUrl(sender) !== null;
  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  const authorizedCamera = await restoreAuthorizedCameraRecorderDocument({
    documentId: sender?.documentId,
    recordingId: message.recordingId,
    senderUrl: cameraSenderUrl,
    tabId: sender?.tab?.id,
  });
  const acknowledgedCameraReplay =
    !popupSender &&
    !authorizedCamera &&
    (await isAcknowledgedVideoPostRecordResultForCamera({
      documentId: sender?.documentId,
      recordingId: message.recordingId,
      senderUrl: cameraSenderUrl,
      tabId: sender?.tab?.id,
    }));
  if (!popupSender && !authorizedCamera && !acknowledgedCameraReplay) {
    sendResponse({ success: false, error: 'Unauthorized post-record result sender' });
    return;
  }

  const result = await acknowledgePendingVideoPostRecordResult(message.recordingId);
  if (result === 'acknowledged') {
    forgetCameraRecorderControlGrant(message.recordingId);
  }
  sendResponse({
    success: true,
    result,
  });
}

/** Only the current top source document may measure the optional native recording clock. */
export function handleRecordingClockTiming(
  binding: RecordingFrameClockBinding,
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  void (async () => {
    const anchor = getRecordingFrameClock();
    if (
      sender?.id !== chrome.runtime.id ||
      sender.frameId !== 0 ||
      typeof sender.documentId !== 'string' ||
      sender.documentId.length === 0 ||
      sender.documentLifecycle !== 'active' ||
      sender.tab?.id !== getVideoRecordingTabId() ||
      !anchor ||
      !matchesRecordingFrameClockBinding(binding, anchor)
    ) {
      sendResponse({ success: false, error: 'RECORDING_CLOCK_SOURCE_UNAVAILABLE' });
      return;
    }
    // The first trusted native anchor can precede completion of activation persistence.
    // This query reads clocks only; primary recording controls still require an active lease.
    const lease = getActiveVideoRecordingLeaseSnapshot();
    const prepared =
      lease?.phase === 'prepared' && lease.recordingTabId === sender.tab?.id && lease.surfaceBinding
        ? {
            recordingId: lease.recordingId,
            generation: lease.surfaceBinding.generation,
            streamInstanceId: lease.surfaceBinding.streamInstanceId,
          }
        : null;
    const active = prepared ?? (await requireActiveVideoRecordingSourceBinding().catch(() => null));
    if (!active || !matchesRecordingFrameClockBinding(binding, active)) {
      sendResponse({ success: false, error: 'RECORDING_CLOCK_BINDING_UNAVAILABLE' });
      return;
    }
    const reply = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_GET_RECORDING_CLOCK_TIMING,
        ...active,
      })
    );
    sendResponse({
      success: true,
      recordingHealth: 'healthy',
      clockTiming: reply.clockTiming ?? null,
    });
  })().catch(() =>
    sendResponse({ success: false, error: 'RECORDING_CLOCK_TRANSPORT_UNAVAILABLE' })
  );
  return HANDLED_ASYNC_RESULT;
}
