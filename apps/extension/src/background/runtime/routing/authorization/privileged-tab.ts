import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeGalleryImageUpdateCapability,
  markPreauthorizedContentActionRouteMessage,
  markPreauthorizedGalleryUpdateRouteMessage,
  type RouteCaptureMessage,
} from '../../../capture/routes';
import {
  consumeExportHarStartCapability,
  isExportHarStopCapabilityAuthorized,
  markPreauthorizedHarStartRouteMessage,
  markPreauthorizedHarStopRouteMessage,
} from '../../../diagnostics/routes';
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
  message?: RouteCaptureMessage | undefined;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
};

function authorizeHarStartRoute(
  message: Extract<RouteCaptureMessage, { type: typeof MessageType.EXPORT_START_HAR }>,
  resolvedTabId: number,
  sender: chrome.runtime.MessageSender | undefined
): IpcAuthorizationResult {
  if (!message.sessionId) return reject('Missing HAR session id');
  if (!message.capabilityToken) return reject('Missing HAR start capability token');
  try {
    const preauthorization = consumeExportHarStartCapability({
      capabilityToken: message.capabilityToken,
      senderUrl: sender?.url,
      sessionId: message.sessionId,
      tabId: resolvedTabId,
    });
    markPreauthorizedHarStartRouteMessage(message, preauthorization);
    return AUTHORIZED;
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'Unauthorized HAR start capability');
  }
}

function authorizeHarStopRoute(
  message: Extract<RouteCaptureMessage, { type: typeof MessageType.EXPORT_STOP_HAR }>,
  resolvedTabId: number
): IpcAuthorizationResult {
  if (!message.sessionId) return reject('Missing HAR session id');
  if (!message.capabilityToken) return reject('Missing HAR capability token');
  if (
    !isExportHarStopCapabilityAuthorized(message.sessionId, resolvedTabId, message.capabilityToken)
  ) {
    return reject('Unauthorized HAR capability');
  }
  markPreauthorizedHarStopRouteMessage(message);
  return AUTHORIZED;
}

function authorizeGalleryUpdateRoute(
  message: Extract<RouteCaptureMessage, { type: typeof MessageType.UPDATE_GALLERY_IMAGE_ASSET }>,
  sender: chrome.runtime.MessageSender | undefined
): IpcAuthorizationResult {
  const senderUrl = sender?.url;
  const documentId = sender?.documentId;
  if (
    !senderUrl ||
    !documentId ||
    !consumeGalleryImageUpdateCapability({
      assetId: message.assetId,
      documentId,
      editorSessionId: message.editorSessionId,
      senderUrl,
      token: message.updateCapabilityToken,
    })
  ) {
    return reject('Unauthorized gallery image update');
  }
  markPreauthorizedGalleryUpdateRouteMessage(message);
  return AUTHORIZED;
}

function authorizeCaptureCapabilityRoute(
  message: RouteCaptureMessage,
  resolvedTabId: number,
  sender: chrome.runtime.MessageSender | undefined
): IpcAuthorizationResult {
  const contentActionCapabilityRequest = {
    actionType: message.type,
    resolvedTabId,
    sender,
  };
  if (shouldRequireContentPrivilegedActionCapability(contentActionCapabilityRequest)) {
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
  if (message.type === MessageType.EXPORT_START_HAR) {
    return authorizeHarStartRoute(message, resolvedTabId, sender);
  }
  if (message.type === MessageType.EXPORT_STOP_HAR) {
    return authorizeHarStopRoute(message, resolvedTabId);
  }
  if (message.type === MessageType.UPDATE_GALLERY_IMAGE_ASSET) {
    return authorizeGalleryUpdateRoute(message, sender);
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
  if (request.family === 'capture' && request.message) {
    return authorizeCaptureCapabilityRoute(request.message, request.resolvedTabId, request.sender);
  }
  return AUTHORIZED;
}
