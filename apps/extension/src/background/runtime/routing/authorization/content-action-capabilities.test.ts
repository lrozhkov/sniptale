import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { authorizeIPCMessage } from './index';
import {
  routeContentPrivilegedActionCapabilityRequest,
  routeContentPrivilegedActionProofRequest,
  resetContentPrivilegedActionCapabilitiesForTests,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';
import {
  getBackgroundOwnedRouteContext,
  getContentActionCapabilityIssuanceSenderBinding,
} from '../../../routing-contracts/owned-route-context';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

const CONTENT_URL = 'https://example.test/page';
const EDITOR_URL = 'chrome-extension://test/apps/extension/src/editor/index.html';
const CONTENT_SENDER_BINDING = {
  documentId: 'content-document-7',
  frameId: 0,
  senderUrl: CONTENT_URL,
  tabId: 7,
} as const;

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function contentSender(tabId = 7): chrome.runtime.MessageSender {
  return sender({
    documentId: `content-document-${tabId}`,
    frameId: 0,
    tabId,
    url: CONTENT_URL,
  });
}

function issueContentIntent(actionType: typeof CaptureMessageType.CAPTURE_VISIBLE) {
  const proofRequest = {
    actionType,
    requestId: 'content-request-1',
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(), {
      actionType,
      requestId: 'content-request-1',
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    contentSender(),
    proofResponse,
    resolveContentSenderBindingForTest(contentSender())
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected trusted-event proof');
  }

  const request = {
    actionType,
    requestId: 'content-request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    contentSender(),
    sendResponse,
    resolveContentSenderBindingForTest(contentSender())
  );
  return (
    sendResponse.mock.calls[0]?.[0] as {
      contentIntent: { requestId: string; token: string };
    }
  ).contentIntent;
}

function createContentIntentRequest() {
  return {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'content-request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: 'proof-token-1' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
}

function createIssuedContentIntentRequest() {
  const proofRequest = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'content-request-1',
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(), {
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'content-request-1',
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    contentSender(),
    proofResponse,
    resolveContentSenderBindingForTest(contentSender())
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected trusted-event proof');
  }
  return {
    ...createContentIntentRequest(),
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
  };
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('rejects content capture routes without a content action capability', () => {
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: { type: CaptureMessageType.CAPTURE_VISIBLE },
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized content action capability',
  });
});

it('authorizes background-owned content action capability issuance with a typed sender binding', () => {
  const request = createIssuedContentIntentRequest();
  const sendResponse = vi.fn();
  const authorization = authorizeIPCMessage({
    kind: 'background-owned',
    message: request,
    sender: contentSender(),
  });

  expect(authorization).toEqual(expect.objectContaining({ authorized: true }));
  if (!authorization.authorized) {
    throw new Error('Expected content action authorization to succeed');
  }
  const senderBinding = getContentActionCapabilityIssuanceSenderBinding(
    getBackgroundOwnedRouteContext(authorization.preauthorization),
    request
  );
  expect(senderBinding).toEqual(CONTENT_SENDER_BINDING);
  expect(
    routeContentPrivilegedActionCapabilityRequest(
      request,
      contentSender(),
      sendResponse,
      senderBinding
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    contentIntent: { requestId: 'content-request-1', token: 'content-token-1' },
    success: true,
  });
});

it.each([
  ['runtime token', { type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN }],
  [
    'trusted-event proof',
    {
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'content-request-1',
      runtimeToken: 'runtime-token-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
    },
  ],
] as const)(
  'authorizes background-owned content action %s issuance with a typed sender binding',
  (_label, request) => {
    const authorization = authorizeIPCMessage({
      kind: 'background-owned',
      message: request,
      sender: contentSender(),
    });

    expect(authorization).toEqual(expect.objectContaining({ authorized: true }));
    if (!authorization.authorized) {
      throw new Error('Expected content action authorization to succeed');
    }
    expect(
      getContentActionCapabilityIssuanceSenderBinding(
        getBackgroundOwnedRouteContext(authorization.preauthorization),
        request
      )
    ).toEqual(CONTENT_SENDER_BINDING);
  }
);

it.each([
  ['missing tab', sender({ documentId: 'content-document-7', frameId: 0, url: CONTENT_URL })],
  [
    'subframe sender',
    sender({ documentId: 'content-document-7', frameId: 1, tabId: 7, url: CONTENT_URL }),
  ],
  ['missing document', sender({ frameId: 0, tabId: 7, url: CONTENT_URL })],
  ['empty document', sender({ documentId: '', frameId: 0, tabId: 7, url: CONTENT_URL })],
  [
    'extension url',
    sender({ documentId: 'content-document-7', frameId: 0, tabId: 7, url: EDITOR_URL }),
  ],
] as const)(
  'rejects background-owned content action capability issuance from %s',
  (_label, source) => {
    expect(
      authorizeIPCMessage({
        kind: 'background-owned',
        message: createContentIntentRequest(),
        sender: source,
      })
    ).toEqual({
      authorized: false,
      reason: 'Unauthorized content action capability sender',
    });
  }
);

it('authorizes content capture routes with a matching one-shot capability', () => {
  const contentIntent = issueContentIntent(CaptureMessageType.CAPTURE_VISIBLE);
  const message = { contentIntent, type: CaptureMessageType.CAPTURE_VISIBLE };

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized content action capability',
  });
});

it('does not require content action capabilities for extension-owned editor save routes', () => {
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: {
        actionType: 'download_default',
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        type: MessageType.EXECUTE_SAVE,
      },
      resolvedTabId: 7,
      sender: sender({ documentId: 'editor-doc-1', tabId: 99, url: EDITOR_URL }),
    })
  ).toEqual({ authorized: true });
});
