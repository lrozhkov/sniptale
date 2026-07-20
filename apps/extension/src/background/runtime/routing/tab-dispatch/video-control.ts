import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { routeVideoControlMessage } from '../../../media/routes';
import {
  resolveTrustedCameraRecorderRuntimeSenderUrl,
  resolveTrustedPopupRuntimeSenderUrl,
} from '../../../media/video/runtime/sender-policy';
import { authorizeIPCMessage } from '../authorization';
import { isVideoControlMessage } from '../message-guards/guards/tab';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import type { TabRouteArgs } from '../boundary/shared';

function isCameraStartWithoutTab(message: TabRouteArgs['message']): boolean {
  return (
    message.type === VideoMessageType.START_RECORDING && message.captureMode === CaptureMode.CAMERA
  );
}

function isCameraRecorderControlWithoutTab(message: TabRouteArgs['message']): boolean {
  return (
    message.type === VideoMessageType.CANCEL_RECORDING_START ||
    message.type === VideoMessageType.PAUSE_RECORDING ||
    message.type === VideoMessageType.RESUME_RECORDING ||
    message.type === VideoMessageType.STOP_RECORDING ||
    message.type === VideoMessageType.UPDATE_SETTINGS
  );
}

export function routePopupRecordingControlWithoutTabId(args: {
  message: TabRouteArgs['message'];
  resolvedTabId: number | undefined;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
}): boolean {
  if (!isVideoControlMessage(args.message)) {
    return false;
  }

  const authorizationKind = resolveNoTabAuthorizationKind(args.message, args.sender);
  if (authorizationKind === null) {
    return false;
  }
  if (
    typeof args.resolvedTabId === 'number' &&
    authorizationKind !== 'video-control-camera-recorder-route'
  ) {
    return false;
  }

  const authorization = authorizeIPCMessage({
    kind: authorizationKind,
    message: args.message,
    sender: args.sender,
  });
  if (!authorization.authorized) {
    args.sendResponse(createRouteErrorResponse(authorization.reason));
    return true;
  }

  routeVideoControlMessage({
    message: args.message,
    resolvedTabId: undefined,
    sendResponse: args.sendResponse,
    sender: args.sender,
  });
  return true;
}

function resolveNoTabAuthorizationKind(
  message: TabRouteArgs['message'],
  sender: chrome.runtime.MessageSender | undefined
):
  | 'video-control-camera-recorder-route'
  | 'video-control-no-tab-route'
  | 'video-control-owner-no-tab-route'
  | null {
  if (isCameraStartWithoutTab(message)) {
    return 'video-control-no-tab-route';
  }
  if (!isCameraRecorderControlWithoutTab(message)) {
    return null;
  }
  if (resolveTrustedCameraRecorderRuntimeSenderUrl(sender) !== null) {
    return 'video-control-camera-recorder-route';
  }
  if (resolveTrustedPopupRuntimeSenderUrl(sender) !== null) {
    return 'video-control-owner-no-tab-route';
  }
  return null;
}
