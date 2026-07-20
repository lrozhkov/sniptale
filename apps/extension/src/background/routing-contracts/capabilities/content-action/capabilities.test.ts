import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeContentPrivilegedActionCapability,
  issueContentPrivilegedActionAutoStartGrant,
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionRuntimeTokenRequest,
  routeContentPrivilegedActionCapabilityRequest,
} from './route';
import {
  issueContentActionActivationKeyForTest,
  resolveContentSenderBindingForTest,
} from './test-support';
vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function contentSender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    documentId: 'content-doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
    ...overrides,
  } satisfies chrome.runtime.MessageSender;
}

function readContentIntent(sendResponse: ReturnType<typeof vi.fn>) {
  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
    success?: boolean;
  };
  if (!response.contentIntent) {
    throw new Error('Expected content intent response.');
  }
  return response.contentIntent;
}

function readTrustedEventProof(sendResponse: ReturnType<typeof vi.fn>) {
  const response = sendResponse.mock.calls[0]?.[0] as {
    success?: boolean;
    trustedEventProof?: { proofToken: string };
  };
  if (!response.trustedEventProof) {
    throw new Error('Expected trusted-event proof response.');
  }
  return response.trustedEventProof;
}

function requestRuntimeToken(
  args: {
    actionType?: CaptureMessageType | MessageType;
    requestId?: string;
    sender?: chrome.runtime.MessageSender;
  } = {}
) {
  const message = {
    activationProof: issueContentActionActivationKeyForTest(args.sender ?? contentSender()),
    actionType: args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE,
    requestId: args.requestId ?? 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
  const sendResponse = vi.fn();
  const sender = args.sender ?? contentSender();
  routeContentPrivilegedActionRuntimeTokenRequest(
    message,
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );
  const response = sendResponse.mock.calls[0]?.[0] as {
    runtimeToken?: { runtimeToken: string };
  };
  if (!response.runtimeToken) {
    throw new Error('Expected runtime token response.');
  }
  return response.runtimeToken.runtimeToken;
}

function requestTrustedEventProof(
  args: {
    actionType?: CaptureMessageType | MessageType;
    requestId?: string;
    sender?: chrome.runtime.MessageSender;
  } = {}
) {
  const message = {
    actionType: args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE,
    requestId: args.requestId ?? 'request-1',
    runtimeToken: requestRuntimeToken(args),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const sendResponse = vi.fn();
  const sender = args.sender ?? contentSender();
  expect(
    routeContentPrivilegedActionProofRequest(
      message,
      sender,
      sendResponse,
      resolveContentSenderBindingForTest(sender)
    )
  ).toBe(true);
  return readTrustedEventProof(sendResponse);
}

function issueTrustedContentIntent(actionType = CaptureMessageType.CAPTURE_VISIBLE) {
  const proof = requestTrustedEventProof({ actionType, requestId: 'request-1' });
  const message = {
    actionType,
    requestId: 'request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  expect(
    routeContentPrivilegedActionCapabilityRequest(
      message,
      contentSender(),
      sendResponse,
      resolveContentSenderBindingForTest(contentSender())
    )
  ).toBe(true);
  return readContentIntent(sendResponse);
}

function requestAutoStartContentIntent(args: {
  actionType: CaptureMessageType | MessageType;
  grantToken: string;
  requestId: string;
}) {
  const sendResponse = vi.fn();
  const message = {
    actionType: args.actionType,
    requestId: args.requestId,
    source: { grantToken: args.grantToken, kind: 'background-auto-start' as const },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      message,
      contentSender(),
      sendResponse,
      resolveContentSenderBindingForTest(contentSender())
    )
  ).toBe(true);
  return readContentIntent(sendResponse);
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('issues and consumes a sender-bound one-shot content action capability', () => {
  const contentIntent = issueTrustedContentIntent();

  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      contentIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(true);
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      contentIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(false);
});

it('rejects wrong sender, action, and request bindings', () => {
  const wrongSenderIntent = issueTrustedContentIntent();
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      contentIntent: wrongSenderIntent,
      resolvedTabId: 7,
      sender: contentSender({ documentId: 'content-doc-2' }),
    })
  ).toBe(false);

  const wrongActionIntent = issueTrustedContentIntent();
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_FULL,
      contentIntent: wrongActionIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(false);

  const wrongRequestIntent = issueTrustedContentIntent();
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      contentIntent: { ...wrongRequestIntent, requestId: 'request-2' },
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(false);
});

it('exchanges an auto-start grant for each allowed operation only once', () => {
  const grant = issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP, MessageType.EXECUTE_SAVE],
    tabId: 7,
  });
  const sendResponse = vi.fn();
  const message = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    requestId: 'request-1',
    source: { grantToken: grant.grantToken, kind: 'background-auto-start' as const },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      message,
      contentSender(),
      sendResponse,
      resolveContentSenderBindingForTest(contentSender())
    )
  ).toBe(true);
  expect(sendResponse.mock.calls[0]?.[0]).toEqual({
    contentIntent: { requestId: 'request-1', token: 'content-token-1' },
    success: true,
  });

  const replayResponse = vi.fn();
  routeContentPrivilegedActionCapabilityRequest(
    message,
    contentSender(),
    replayResponse,
    resolveContentSenderBindingForTest(contentSender())
  );
  expect(replayResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action capability request',
    success: false,
  });
});

it('exchanges a visible auto-start grant for capture and preset-session save once each', () => {
  const grant = issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE, MessageType.EXECUTE_SAVE],
    tabId: 7,
  });
  const captureIntent = requestAutoStartContentIntent({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    grantToken: grant.grantToken,
    requestId: 'capture-request-1',
  });

  expect(
    consumeContentPrivilegedActionCapability({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      contentIntent: captureIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(true);

  const saveIntent = requestAutoStartContentIntent({
    actionType: MessageType.EXECUTE_SAVE,
    grantToken: grant.grantToken,
    requestId: 'save-request-1',
  });
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: MessageType.EXECUTE_SAVE,
      contentIntent: saveIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(true);
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: MessageType.EXECUTE_SAVE,
      contentIntent: saveIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(false);
});
