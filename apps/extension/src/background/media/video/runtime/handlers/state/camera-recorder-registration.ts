import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  getActiveVideoRecordingLeaseSnapshot,
} from '../../../recording-control-lease';
import { authorizeCameraRecorderDocument } from '../../camera-recorder-control';
import { resolveTrustedCameraRecorderRuntimeSenderUrl } from '../../sender-policy';
import { HANDLED_ASYNC_RESULT, type RouteResult } from '../shared';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

export function handleRegisterCameraRecorderControl(
  message: { cameraLaunchToken: string; recordingId: string },
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
  message: { cameraLaunchToken: string; recordingId: string },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  await ensureActiveVideoRecordingLeaseHydrated();

  const lease = getActiveVideoRecordingLeaseSnapshot();
  if (!lease || lease.expiresAt <= Date.now() || lease.recordingId !== message.recordingId) {
    sendResponse({ success: false, error: 'Recording control lease is unavailable' });
    return;
  }

  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  if (!isRegistrationAuthorized(message, sender, cameraSenderUrl)) {
    sendResponse({ success: false, error: 'Unauthorized camera recorder control' });
    return;
  }

  sendResponse({
    success: true,
    controlToken: lease.controlToken,
    recordingId: lease.recordingId,
  });
}

function isRegistrationAuthorized(
  message: { cameraLaunchToken: string; recordingId: string },
  sender: chrome.runtime.MessageSender | undefined,
  cameraSenderUrl: string | null
): boolean {
  return (
    cameraSenderUrl !== null &&
    authorizeCameraRecorderDocument({
      documentId: sender?.documentId,
      launchToken: message.cameraLaunchToken,
      recordingId: message.recordingId,
      senderUrl: cameraSenderUrl,
    })
  );
}
