import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionCapabilityRequest,
  routeContentPrivilegedActionRuntimeTokenRequest,
  routeContentPrivilegedActionProofRequest,
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

function routeAuthorizedProofRequest(
  message: Parameters<typeof routeContentPrivilegedActionProofRequest>[0],
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeContentPrivilegedActionProofRequest>[2]
): boolean {
  return routeContentPrivilegedActionProofRequest(
    message,
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );
}

function routeAuthorizedCapabilityRequest(
  message: Parameters<typeof routeContentPrivilegedActionCapabilityRequest>[0],
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeContentPrivilegedActionCapabilityRequest>[2]
): boolean {
  return routeContentPrivilegedActionCapabilityRequest(
    message,
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
  );
}

function requestTrustedEventProof(
  args: {
    actionType?: CaptureMessageType | MessageType;
    requestId?: string;
    sender?: chrome.runtime.MessageSender;
  } = {}
) {
  const sender = args.sender ?? contentSender();
  const message = {
    actionType: args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE,
    requestId: args.requestId ?? 'request-1',
    runtimeToken: requestRuntimeToken({ ...args, sender }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const sendResponse = vi.fn();
  routeAuthorizedProofRequest(message, sender, sendResponse);
  const response = sendResponse.mock.calls[0]?.[0] as {
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
  const sender = args.sender ?? contentSender();
  const message = {
    activationProof: issueContentActionActivationKeyForTest(sender),
    actionType: args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE,
    requestId: args.requestId ?? 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
  const sendResponse = vi.fn();
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

function requestCapabilityWithProof(args: {
  actionType?: CaptureMessageType | MessageType;
  proofToken: string;
  requestId?: string;
  sender?: chrome.runtime.MessageSender;
}) {
  const message = {
    actionType: args.actionType ?? CaptureMessageType.CAPTURE_VISIBLE,
    requestId: args.requestId ?? 'request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: args.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  const sender = args.sender ?? contentSender();
  routeAuthorizedCapabilityRequest(message, sender, sendResponse);
  return sendResponse.mock.calls[0]?.[0];
}

function expectUnauthorizedCapabilityResponse(response: unknown): void {
  expect(response).toMatchObject({
    error: 'Unauthorized content action capability request',
    success: false,
  });
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('rejects forged trusted-content-event requests without a background proof', () => {
  const sendResponse = vi.fn();
  const message = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
    source: { kind: 'trusted-content-event' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };

  expect(routeAuthorizedCapabilityRequest(message, contentSender(), sendResponse)).toBe(false);
  expect(sendResponse).not.toHaveBeenCalled();
});

it('requires a fresh one-shot trusted-event proof for capability issuance', () => {
  const proof = requestTrustedEventProof({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });

  expect(requestCapabilityWithProof({ proofToken: proof.proofToken })).toEqual({
    contentIntent: { requestId: 'request-1', token: 'content-token-1' },
    success: true,
  });
  expectUnauthorizedCapabilityResponse(
    requestCapabilityWithProof({ proofToken: proof.proofToken })
  );
});

it('rejects trusted-event proofs with wrong request, action, sender, or expiry', () => {
  const wrongRequestProof = requestTrustedEventProof({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });
  expectUnauthorizedCapabilityResponse(
    requestCapabilityWithProof({
      proofToken: wrongRequestProof.proofToken,
      requestId: 'request-2',
    })
  );

  const wrongActionProof = requestTrustedEventProof({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });
  expectUnauthorizedCapabilityResponse(
    requestCapabilityWithProof({
      actionType: CaptureMessageType.CAPTURE_FULL,
      proofToken: wrongActionProof.proofToken,
    })
  );

  const wrongSenderProof = requestTrustedEventProof({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });
  expectUnauthorizedCapabilityResponse(
    requestCapabilityWithProof({
      proofToken: wrongSenderProof.proofToken,
      sender: contentSender({ documentId: 'content-doc-2' }),
    })
  );

  const nowSpy = vi.spyOn(Date, 'now');
  nowSpy.mockReturnValue(1_000);
  const expiredProof = requestTrustedEventProof({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });
  nowSpy.mockReturnValue(6_001);
  expectUnauthorizedCapabilityResponse(
    requestCapabilityWithProof({ proofToken: expiredProof.proofToken })
  );
  nowSpy.mockRestore();
});

it('rejects runtime tokens presented by a different content sender', () => {
  const proofRequest = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
    runtimeToken: requestRuntimeToken({
      sender: contentSender({ documentId: 'content-doc-1' }),
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const sendResponse = vi.fn();

  expect(
    routeAuthorizedProofRequest(
      proofRequest,
      contentSender({ documentId: 'content-doc-2' }),
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action proof request',
    success: false,
  });
});

it('rejects runtime tokens presented for a different operation', () => {
  const runtimeToken = requestRuntimeToken({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
  });
  const wrongActionRequest = {
    actionType: CaptureMessageType.CAPTURE_FULL,
    requestId: 'request-1',
    runtimeToken,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const wrongActionResponse = vi.fn();

  expect(
    routeAuthorizedProofRequest(wrongActionRequest, contentSender(), wrongActionResponse)
  ).toBe(true);
  expect(wrongActionResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action proof request',
    success: false,
  });
});

it('rejects runtime tokens reused after proof issuance', () => {
  const reusableRuntimeToken = requestRuntimeToken({
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-2',
  });
  const proofRequest = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-2',
    runtimeToken: reusableRuntimeToken,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const firstResponse = vi.fn();
  const secondResponse = vi.fn();

  routeAuthorizedProofRequest(proofRequest, contentSender(), firstResponse);
  routeAuthorizedProofRequest(proofRequest, contentSender(), secondResponse);

  expect(firstResponse).toHaveBeenCalledWith({
    success: true,
    trustedEventProof: { proofToken: 'content-token-1' },
  });
  expect(secondResponse.mock.calls[0]?.[0]).toMatchObject({
    error: 'Unauthorized content action proof request',
    success: false,
  });
});
