import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeContentPrivilegedActionCapability,
  consumeContentPrivilegedActionCapabilityBinding,
  issueContentPrivilegedActionAutoStartGrant,
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionCapabilityRequest,
  shouldRequireContentPrivilegedActionCapability,
} from './route';
import {
  issueContentActionActivationKeyForTest,
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from './test-support';

function contentSender(tabId: number): chrome.runtime.MessageSender {
  return {
    documentId: `document-${tabId}`,
    frameId: 0,
    tab: { id: tabId } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
}

function issueRecordingCapability(tabId: number) {
  const proofRequest = {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    requestId: `recording-request-${tabId}`,
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(tabId), {
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      requestId: `recording-request-${tabId}`,
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    contentSender(tabId),
    proofResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );
  const proof = (
    proofResponse.mock.calls[0]?.[0] as {
      trustedEventProof?: { proofToken: string };
    }
  ).trustedEventProof;
  if (!proof) {
    throw new Error('Expected trusted-event proof');
  }

  const request = {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    requestId: `recording-request-${tabId}`,
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    contentSender(tabId),
    sendResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );

  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
  };
  if (!response.contentIntent) {
    throw new Error('Expected content intent');
  }
  return response.contentIntent;
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
});

it('consumes recording content capabilities with the authorized sender binding', () => {
  const contentIntent = issueRecordingCapability(7);

  expect(
    consumeContentPrivilegedActionCapabilityBinding({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      contentIntent,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({
    documentId: 'document-7',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  });

  const secondContentIntent = issueRecordingCapability(7);

  expect(
    consumeContentPrivilegedActionCapability({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      contentIntent: secondContentIntent,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toBe(true);
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      contentIntent: secondContentIntent,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toBe(false);
});

it('rejects recording content capabilities when sender binding cannot be resolved', () => {
  const contentIntent = issueRecordingCapability(7);

  expect(
    consumeContentPrivilegedActionCapabilityBinding({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      contentIntent,
      resolvedTabId: 7,
      sender: { ...contentSender(7), tab: { id: 8 } as chrome.tabs.Tab },
    })
  ).toBeNull();
});

it('ignores malformed content capability requests before route handling', () => {
  const sendResponse = vi.fn();

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      { actionType: 'UNKNOWN_ACTION' },
      contentSender(7),
      sendResponse,
      resolveContentSenderBindingForTest(contentSender(7))
    )
  ).toBe(false);
  expect(sendResponse).not.toHaveBeenCalled();
});

it('rejects content capability requests from unbound or untrusted senders', () => {
  const sendResponse = vi.fn();
  const request = createCapabilityRequest({
    source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
  });

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      request,
      { ...contentSender(7), frameId: 1 },
      sendResponse,
      null
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action capability sender',
    success: false,
  });
});

it('requires valid auto-start grants for background-started content capability requests', () => {
  const rejectedResponse = vi.fn();
  const acceptedResponse = vi.fn();
  const rejectedRequest = createCapabilityRequest({
    source: { kind: 'background-auto-start', grantToken: 'missing-grant' },
  });
  const grant = issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK],
    tabId: 7,
  });
  const acceptedRequest = createCapabilityRequest({ source: grantSource(grant.grantToken) });

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      rejectedRequest,
      contentSender(7),
      rejectedResponse,
      resolveContentSenderBindingForTest(contentSender(7))
    )
  ).toBe(true);
  expect(rejectedResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action capability request',
    success: false,
  });

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      acceptedRequest,
      contentSender(7),
      acceptedResponse,
      resolveContentSenderBindingForTest(contentSender(7))
    )
  ).toBe(true);
  expect(acceptedResponse).toHaveBeenCalledWith({
    success: true,
    contentIntent: { requestId: 'recording-request-1', token: expect.any(String) },
  });
});

it('classifies only resolved content senders for content capability requirements', () => {
  expect(
    shouldRequireContentPrivilegedActionCapability({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toBe(true);
  expect(
    shouldRequireContentPrivilegedActionCapability({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      resolvedTabId: 7,
      sender: { ...contentSender(7), tab: { id: 8 } as chrome.tabs.Tab },
    })
  ).toBe(false);
  expect(
    shouldRequireContentPrivilegedActionCapability({
      actionType: 'UNKNOWN_ACTION',
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toBe(false);
});

it('fails closed before issuing a test activation key for a sender without a tab', () => {
  expect(() =>
    issueContentActionActivationKeyForTest({
      documentId: 'document-missing-tab',
      frameId: 0,
      url: 'https://example.test/page',
    })
  ).toThrow();
});

function createCapabilityRequest(args: {
  source:
    | { kind: 'trusted-content-event-proof'; proofToken: string }
    | { grantToken: string; kind: 'background-auto-start' };
}) {
  return {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    requestId: 'recording-request-1',
    source: args.source,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
}

function grantSource(grantToken: string) {
  return { grantToken, kind: 'background-auto-start' as const };
}
