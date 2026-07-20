import { createRouteErrorResponse } from '../../response';
import {
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionType,
  type ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseContentPrivilegedActionActivationKeyRequest,
  parseContentPrivilegedActionCapabilityRequest,
  parseContentPrivilegedActionProofRequest,
  parseContentPrivilegedActionRuntimeTokenRequest,
  type ContentPrivilegedActionCapabilityRequest,
} from './capability-requests';
import {
  consumeContentPrivilegedActionActivationProof,
  issueContentPrivilegedActionActivationKey,
  resetContentPrivilegedActionActivationKeysForTests,
} from './activation-store';
import {
  consumeAutoStartGrantForCapabilityRequest,
  consumeIssuedContentPrivilegedActionCapability,
  issueContentPrivilegedActionAutoStartGrant,
  issueContentPrivilegedActionCapability,
  resetContentPrivilegedActionCapabilityStoreForTests,
  type ContentSenderBinding,
} from './capability-store';
import { authorizeContentSender } from './sender-binding';
import {
  consumeTrustedEventProofForCapabilityRequest,
  issueContentPrivilegedActionRuntimeToken,
  issueContentPrivilegedActionTrustedEventProof,
  resetContentPrivilegedActionProofsForTests,
} from './proof-store';

export { issueContentPrivilegedActionAutoStartGrant };

export function resetContentPrivilegedActionCapabilitiesForTests(): void {
  resetContentPrivilegedActionActivationKeysForTests();
  resetContentPrivilegedActionCapabilityStoreForTests();
  resetContentPrivilegedActionProofsForTests();
}

function canIssueCapabilityForRequest(args: {
  request: ContentPrivilegedActionCapabilityRequest;
  senderBinding: ContentSenderBinding;
}): boolean {
  if (args.request.source.kind === 'trusted-content-event-proof') {
    return consumeTrustedEventProofForCapabilityRequest({
      actionType: args.request.actionType,
      requestId: args.request.requestId,
      senderBinding: args.senderBinding,
      source: args.request.source,
    });
  }

  return consumeAutoStartGrantForCapabilityRequest({
    actionType: args.request.actionType,
    senderBinding: args.senderBinding,
    source: args.request.source,
  });
}

export function routeContentPrivilegedActionProofRequest(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  preauthorizedSenderBinding: ContentSenderBinding | null
): boolean {
  const request = parseContentPrivilegedActionProofRequest(message);
  if (!request) {
    return false;
  }

  if (!preauthorizedSenderBinding) {
    sendResponse(createRouteErrorResponse('Unauthorized content action proof sender'));
    return true;
  }

  const trustedEventProof = issueContentPrivilegedActionTrustedEventProof({
    actionType: request.actionType,
    requestId: request.requestId,
    runtimeToken: request.runtimeToken,
    senderBinding: preauthorizedSenderBinding,
  });
  if (!trustedEventProof) {
    sendResponse(createRouteErrorResponse('Unauthorized content action proof request'));
    return true;
  }

  sendResponse({
    success: true,
    trustedEventProof,
  });
  return true;
}

export function routeContentPrivilegedActionActivationKeyRequest(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  preauthorizedSenderBinding: ContentSenderBinding | null
): boolean {
  const request = parseContentPrivilegedActionActivationKeyRequest(message);
  if (!request) {
    return false;
  }

  if (!preauthorizedSenderBinding) {
    sendResponse(createRouteErrorResponse('Unauthorized content action activation sender'));
    return true;
  }

  const activationKey = issueContentPrivilegedActionActivationKey(
    preauthorizedSenderBinding,
    request.purpose
  );
  if (activationKey.status === 'already-claimed') {
    sendResponse(createRouteErrorResponse('Content action activation key already claimed'));
    return true;
  }
  if (activationKey.status === 'rate-limited') {
    sendResponse(createRouteErrorResponse('Content action activation key rate limited'));
    return true;
  }

  sendResponse({
    activationKey: activationKey.activationKey,
    success: true,
  });
  return true;
}

export function routeContentPrivilegedActionRuntimeTokenRequest(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  preauthorizedSenderBinding: ContentSenderBinding | null
): boolean {
  const request = parseContentPrivilegedActionRuntimeTokenRequest(message);
  if (!request) {
    return false;
  }

  if (!preauthorizedSenderBinding) {
    sendResponse(createRouteErrorResponse('Unauthorized content action runtime sender'));
    return true;
  }

  if (
    !consumeContentPrivilegedActionActivationProof({
      actionType: request.actionType,
      proof: request.activationProof,
      senderBinding: preauthorizedSenderBinding,
    })
  ) {
    sendResponse(createRouteErrorResponse('Unauthorized content action activation proof'));
    return true;
  }

  sendResponse({
    success: true,
    runtimeToken: issueContentPrivilegedActionRuntimeToken({
      actionType: request.actionType,
      requestId: request.requestId,
      senderBinding: preauthorizedSenderBinding,
    }),
  });
  return true;
}

export function routeContentPrivilegedActionCapabilityRequest(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  preauthorizedSenderBinding: ContentSenderBinding | null
): boolean {
  const request = parseContentPrivilegedActionCapabilityRequest(message);
  if (!request) {
    return false;
  }

  if (!preauthorizedSenderBinding) {
    sendResponse(createRouteErrorResponse('Unauthorized content action capability sender'));
    return true;
  }

  if (!canIssueCapabilityForRequest({ request, senderBinding: preauthorizedSenderBinding })) {
    sendResponse(createRouteErrorResponse('Unauthorized content action capability request'));
    return true;
  }

  sendResponse({
    success: true,
    contentIntent: issueContentPrivilegedActionCapability({
      actionType: request.actionType,
      requestId: request.requestId,
      senderBinding: preauthorizedSenderBinding,
    }),
  });
  return true;
}

export function shouldRequireContentPrivilegedActionCapability(args: {
  actionType: unknown;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
}): args is {
  actionType: ContentPrivilegedActionType;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender;
} {
  return (
    isContentPrivilegedActionType(args.actionType) &&
    authorizeContentSender(args.sender, args.resolvedTabId).allowed
  );
}

export function consumeContentPrivilegedActionCapability(args: {
  actionType: ContentPrivilegedActionType;
  contentIntent: unknown;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
}): boolean {
  return consumeContentPrivilegedActionCapabilityBinding(args) !== null;
}

export function consumeContentPrivilegedActionCapabilityBinding(args: {
  actionType: ContentPrivilegedActionType;
  contentIntent: unknown;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
}): ContentSenderBinding | null {
  if (!isContentPrivilegedActionCapability(args.contentIntent)) {
    return null;
  }

  const senderDecision = authorizeContentSender(args.sender, args.resolvedTabId);
  if (!senderDecision.allowed) {
    return null;
  }

  const authorized = consumeIssuedContentPrivilegedActionCapability({
    actionType: args.actionType,
    contentIntent: args.contentIntent,
    senderBinding: senderDecision.principal,
  });
  return authorized ? senderDecision.principal : null;
}
