import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';
import { AUTHORIZED, reject } from '../../../routing-contracts/authorization-result';
import { isAuthorizedCameraRecorderDocument } from '../../../media/video/runtime/camera-recorder-control';
import { resolveTrustedCameraRecorderRuntimeSenderUrl } from '../../../media/video/runtime/sender-policy';

export type VideoControlCameraRecorderAuthorizationRequest = {
  kind: 'video-control-camera-recorder-route';
  message: unknown;
  sender: chrome.runtime.MessageSender | undefined;
};

function isCameraRecorderControlMessage(message: unknown): message is { recordingId: string } {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }

  const type = message.type;
  if (
    type !== VideoMessageType.PAUSE_RECORDING &&
    type !== VideoMessageType.RESUME_RECORDING &&
    type !== VideoMessageType.STOP_RECORDING &&
    type !== VideoMessageType.UPDATE_SETTINGS
  ) {
    return false;
  }

  return 'recordingId' in message && typeof message.recordingId === 'string';
}

export function authorizeVideoControlCameraRecorderRoute(
  request: VideoControlCameraRecorderAuthorizationRequest
): IpcAuthorizationResult {
  if (!isCameraRecorderControlMessage(request.message)) {
    return reject('Unauthorized camera recorder control route');
  }

  const senderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(request.sender);
  if (
    !isAuthorizedCameraRecorderDocument({
      documentId: request.sender?.documentId,
      recordingId: request.message.recordingId,
      senderUrl,
    })
  ) {
    return reject('Unauthorized camera recorder control sender');
  }

  return AUTHORIZED;
}
