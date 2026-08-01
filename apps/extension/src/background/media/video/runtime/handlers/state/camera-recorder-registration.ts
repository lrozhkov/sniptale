import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  getActiveVideoRecordingLeaseSnapshot,
} from '../../../recording-control-lease';
import {
  authorizeCameraRecorderDocument,
  reconnectCameraRecorderDocument,
} from '../../camera-recorder-control';
import { resolveTrustedCameraRecorderRuntimeSenderUrl } from '../../sender-policy';
import { HANDLED_ASYNC_RESULT, type RouteResult } from '../shared';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

export function handleRegisterCameraRecorderControl(
  message: { cameraRegistrationToken?: string; recordingId?: string },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  void registerCameraRecorderControl(message, sendResponse, sender).catch((error) => {
    logger.warn('Failed to register camera recorder control', error);
    sendResponse({ success: false, error: 'Unable to register camera recorder control' });
  });
  return HANDLED_ASYNC_RESULT;
}

async function registerCameraRecorderControl(
  message: { cameraRegistrationToken?: string; recordingId?: string },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  const authorization = await authorizeRegistration(message, sender, cameraSenderUrl);
  if (!authorization) {
    sendResponse({ success: false, error: 'Unauthorized camera recorder control' });
    return;
  }

  await ensureActiveVideoRecordingLeaseHydrated();
  const lease = getActiveVideoRecordingLeaseSnapshot();
  if (!lease || lease.expiresAt <= Date.now() || lease.recordingId !== authorization.recordingId) {
    sendResponse({
      success: true,
      recordingId: authorization.recordingId,
      result: 'post-record-only',
    });
    return;
  }

  sendResponse({
    success: true,
    controlToken: lease.controlToken,
    recordingId: lease.recordingId,
    result: 'active',
  });
}

async function authorizeRegistration(
  message: { cameraRegistrationToken?: string; recordingId?: string },
  sender: chrome.runtime.MessageSender | undefined,
  cameraSenderUrl: string | null
): Promise<{ recordingId: string } | null> {
  if (cameraSenderUrl === null) {
    return Promise.resolve(null);
  }
  if ((message.cameraRegistrationToken === undefined) !== (message.recordingId === undefined)) {
    return Promise.resolve(null);
  }
  const senderBinding = {
    documentId: sender?.documentId,
    senderUrl: cameraSenderUrl,
    tabId: sender?.tab?.id,
  };
  return message.cameraRegistrationToken && message.recordingId
    ? authorizeCameraRecorderDocument({
        ...senderBinding,
        registrationToken: message.cameraRegistrationToken,
        recordingId: message.recordingId,
      })
    : reconnectCameraRecorderDocument(senderBinding);
}
