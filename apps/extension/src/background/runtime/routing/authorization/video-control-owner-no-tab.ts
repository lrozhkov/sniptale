import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';
import { AUTHORIZED, reject } from '../../../routing-contracts/authorization-result';
import { resolveTrustedPopupRuntimeSenderUrl } from '../../../media/video/runtime/sender-policy';

export type VideoControlOwnerNoTabAuthorizationRequest = {
  kind: 'video-control-owner-no-tab-route';
  message: unknown;
  sender: chrome.runtime.MessageSender | undefined;
};

function isOwnerNoTabControlMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }

  const type = message.type;
  if (
    type !== VideoMessageType.CANCEL_RECORDING_START &&
    type !== VideoMessageType.PAUSE_RECORDING &&
    type !== VideoMessageType.RESUME_RECORDING &&
    type !== VideoMessageType.STOP_RECORDING &&
    type !== VideoMessageType.UPDATE_SETTINGS
  ) {
    return false;
  }

  return (
    'controlToken' in message &&
    typeof message.controlToken === 'string' &&
    'recordingId' in message &&
    typeof message.recordingId === 'string'
  );
}

export function authorizeVideoControlOwnerNoTabRoute(
  request: VideoControlOwnerNoTabAuthorizationRequest
): IpcAuthorizationResult {
  if (!resolveTrustedPopupRuntimeSenderUrl(request.sender)) {
    return reject('Unauthorized video-control owner no-tab route sender');
  }
  if (!isOwnerNoTabControlMessage(request.message)) {
    return reject('Unauthorized video-control owner no-tab route');
  }

  return AUTHORIZED;
}
