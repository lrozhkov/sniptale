import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';
import { AUTHORIZED, reject } from '../../../routing-contracts/authorization-result';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';

export type VideoControlNoTabAuthorizationRequest = {
  kind: 'video-control-no-tab-route';
  message: unknown;
  sender: chrome.runtime.MessageSender | undefined;
};

function isVideoControlNoTabMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }

  return (
    message.type === VideoMessageType.START_RECORDING &&
    'captureMode' in message &&
    message.captureMode === CaptureMode.CAMERA
  );
}

export function authorizeVideoControlNoTabRoute(
  request: VideoControlNoTabAuthorizationRequest
): IpcAuthorizationResult {
  if (!isPopupTabRouteSenderUrl(request.sender?.url)) {
    return reject('Unauthorized video-control camera route sender');
  }
  if (!isVideoControlNoTabMessage(request.message)) {
    return reject('Unauthorized video-control no-tab route');
  }

  return AUTHORIZED;
}
