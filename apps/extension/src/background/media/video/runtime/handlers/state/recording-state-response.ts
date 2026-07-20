import type { RecordingStateHealth } from '../../../../../../contracts/messaging/contracts/response-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { isAuthorizedCameraRecorderDocument } from '../../camera-recorder-control';
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
    sendRecordingStateResponse(sendResponse, sender);
  });
  return HANDLED_ASYNC_RESULT;
}

async function sendHydratedRecordingState(
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  await ensureActiveVideoRecordingLeaseHydrated();
  sendRecordingStateResponse(sendResponse, sender);
}

function sendRecordingStateResponse(
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): void {
  const recordingState = getVideoRecordingRuntimeState() as VideoRecordingRuntimeState;
  const controlCapability = resolveRecordingControlCapabilityForSender(sender);
  sendResponse({
    success: true,
    recordingHealth: resolveRecordingStateHealth(recordingState),
    state: recordingState,
    ...(controlCapability ?? {}),
  });
}
