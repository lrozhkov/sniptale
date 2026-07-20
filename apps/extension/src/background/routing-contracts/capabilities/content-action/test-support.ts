import { expect, vi } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionActivationPurpose,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  routeContentPrivilegedActionActivationKeyRequest,
  routeContentPrivilegedActionRuntimeTokenRequest,
} from './route';
import { authorizeContentSender } from './sender-binding';
import type { ContentSenderBinding } from './capability-store';

const activationKeysBySenderBinding = new Map<string, ContentPrivilegedActionActivationKey>();

function getSenderBindingKey(
  sender: chrome.runtime.MessageSender,
  purpose: ContentPrivilegedActionActivationPurpose
): string {
  return [
    purpose,
    sender.tab?.id ?? 'missing-tab',
    sender.frameId ?? 'missing-frame',
    sender.documentId ?? 'missing-document',
    sender.url ?? 'missing-url',
  ].join('\n');
}

function getActivationPurposeForAction(
  actionType: ContentPrivilegedActionType
): ContentPrivilegedActionActivationPurpose {
  return actionType === MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK ||
    actionType === MessageType.SAVE_RECORDING_FOR_DOWNLOAD ||
    actionType === MessageType.RELEASE_RECORDING_DOWNLOAD
    ? 'recording-download'
    : 'trusted-content-event';
}

export function resolveContentSenderBindingForTest(
  sender: chrome.runtime.MessageSender,
  resolvedTabId?: number
): ContentSenderBinding {
  const decision = authorizeContentSender(sender, resolvedTabId);
  expect(decision.allowed).toBe(true);
  return (decision as Extract<typeof decision, { allowed: true }>).principal;
}

export function issueContentActionActivationKeyForTest(
  sender: chrome.runtime.MessageSender,
  purpose: ContentPrivilegedActionActivationPurpose = 'trusted-content-event'
): ContentPrivilegedActionActivationKey {
  const senderBindingKey = getSenderBindingKey(sender, purpose);
  const message = { purpose, type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY };
  const sendResponse = vi.fn();
  expect(
    routeContentPrivilegedActionActivationKeyRequest(
      message,
      sender,
      sendResponse,
      resolveContentSenderBindingForTest(sender)
    )
  ).toBe(true);
  const response = sendResponse.mock.calls[0]?.[0] as {
    activationKey?: ContentPrivilegedActionActivationKey;
  };
  const cachedKey = activationKeysBySenderBinding.get(senderBindingKey);
  if (!response.activationKey && cachedKey) {
    return cachedKey;
  }
  if (!response.activationKey) {
    throw new Error('Expected activation key response.');
  }
  activationKeysBySenderBinding.set(senderBindingKey, response.activationKey);
  return response.activationKey;
}

function clearContentActionActivationKeyForTest(
  sender: chrome.runtime.MessageSender,
  purpose: ContentPrivilegedActionActivationPurpose
): void {
  activationKeysBySenderBinding.delete(getSenderBindingKey(sender, purpose));
}

export function issueContentActionRuntimeTokenForTest(
  sender: chrome.runtime.MessageSender,
  args: {
    actionType?: ContentPrivilegedActionType;
    requestId?: string;
  } = {}
): string {
  const actionType = args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE;
  const purpose = getActivationPurposeForAction(actionType);
  const message = {
    activationProof: issueContentActionActivationKeyForTest(sender, purpose),
    actionType,
    requestId: args.requestId ?? 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
  const sendResponse = vi.fn();
  expect(
    routeContentPrivilegedActionRuntimeTokenRequest(
      message,
      sender,
      sendResponse,
      resolveContentSenderBindingForTest(sender)
    )
  ).toBe(true);
  const response = sendResponse.mock.calls[0]?.[0] as {
    error?: string;
    runtimeToken?: { runtimeToken: string };
  };
  if (!response.runtimeToken && response.error === 'Unauthorized content action activation proof') {
    clearContentActionActivationKeyForTest(sender, purpose);
    return issueContentActionRuntimeTokenForTest(sender, args);
  }
  if (!response.runtimeToken) {
    throw new Error('Expected runtime token response.');
  }
  return response.runtimeToken.runtimeToken;
}
