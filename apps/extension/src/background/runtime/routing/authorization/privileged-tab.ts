import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabModeMessage } from '@sniptale/runtime-contracts/messaging/message-types';
import type { VideoRecordingSurfaceMessage } from '../message-guards/guards/shared';
import {
  markPreauthorizedContentActionRouteMessage,
  type RouteCaptureMessage,
} from '../../../capture/routes';
import {
  AUTHORIZED,
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import {
  consumeContentPrivilegedActionCapabilityBinding,
  shouldRequireContentPrivilegedActionCapability,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  getUnauthorizedPrivilegedTabRouteSenderReason,
  type PrivilegedTabRouteFamily,
} from '../boundary/sender-policy';

export type PrivilegedTabRouteAuthorizationRequest = {
  family: PrivilegedTabRouteFamily;
  kind: 'privileged-tab-route';
  message?: RouteCaptureMessage | TabModeMessage | VideoRecordingSurfaceMessage | undefined;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
};

function authorizePrivilegedTabCapabilityRoute(
  message: RouteCaptureMessage | TabModeMessage | VideoRecordingSurfaceMessage,
  resolvedTabId: number,
  sender: chrome.runtime.MessageSender | undefined
): IpcAuthorizationResult {
  const contentActionCapabilityRequest = {
    actionType: message.type,
    resolvedTabId,
    sender,
  };
  if (shouldRequireContentPrivilegedActionCapability(contentActionCapabilityRequest)) {
    if (
      message.type === MessageType.EXPORT_CAPTURE_FULL_PAGE &&
      message.contentIntent?.requestId !== message.exportRunId
    ) {
      return reject('Full-page export capability identity mismatch');
    }
    const senderBinding = consumeContentPrivilegedActionCapabilityBinding({
      actionType: contentActionCapabilityRequest.actionType,
      contentIntent: 'contentIntent' in message ? message.contentIntent : undefined,
      resolvedTabId,
      sender,
    });
    if (!senderBinding) {
      return reject('Unauthorized content action capability');
    }
    markPreauthorizedContentActionRouteMessage(message, senderBinding);
  }
  return AUTHORIZED;
}

export function authorizePrivilegedTabRoute(
  request: PrivilegedTabRouteAuthorizationRequest
): IpcAuthorizationResult {
  const reason = getUnauthorizedPrivilegedTabRouteSenderReason({
    family: request.family,
    ...(request.family === 'capture' && request.message ? { message: request.message } : {}),
    resolvedTabId: request.resolvedTabId,
    sender: request.sender,
  });
  if (reason) {
    return reject(reason);
  }
  if (request.message) {
    return authorizePrivilegedTabCapabilityRoute(
      request.message,
      request.resolvedTabId,
      request.sender
    );
  }
  return AUTHORIZED;
}
