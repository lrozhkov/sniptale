import type { RecordingStateHealth } from '../../../../../../contracts/messaging/contracts/response-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import {
  forgetCameraRecorderControlGrant,
  isAuthorizedCameraRecorderDocument,
  restoreAuthorizedCameraRecorderDocument,
} from '../../camera-recorder-control';
import {
  getActiveVideoRecordingLeaseSnapshot,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../../../recording-control-lease';
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
  const recordingState = getVideoRecordingRuntimeState() as VideoRecordingRuntimeState;
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
