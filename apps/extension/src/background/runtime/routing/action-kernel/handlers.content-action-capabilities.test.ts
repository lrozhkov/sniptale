import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createActionContext } from './context';
import { handleBackgroundOwnedAction } from './handlers';
import { dispatchBackgroundOwnedRoute } from './owned-route-handlers';
import type { BackgroundOwnedAction } from './types';
import { authorizeIPCMessage } from '../authorization/index';
import { getBackgroundOwnedRouteContext } from '../../../routing-contracts/owned-route-context';
import * as contentCaps from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function createContentIntentRequest() {
  const sender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
  const proofRequest = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'content-request-1',
    runtimeToken: issueContentActionRuntimeTokenForTest(sender, {
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'content-request-1',
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  contentCaps.routeContentPrivilegedActionProofRequest(
    proofRequest,
    sender,
    proofResponse,
    resolveContentSenderBindingForTest(sender)
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected trusted-event proof');
  }

  return {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'content-request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
}

function createAction(
  sendResponse = vi.fn(),
  sender: chrome.runtime.MessageSender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  },
  message: BackgroundOwnedAction['message'] = createContentIntentRequest()
): BackgroundOwnedAction {
  return {
    actionKind: 'background-owned',
    context: createActionContext({
      logger: { warn: vi.fn() },
      runtimeState: createBackgroundRuntimeState(),
      sendResponse,
      sender,
    }),
    message,
    routeName: `background-owned:${MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY}`,
  };
}

function createContentProofRequest(requestId = 'content-request-1') {
  const sender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
  return {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId,
    runtimeToken: issueContentActionRuntimeTokenForTest(sender, {
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'content-request-1',
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
}

beforeEach(() => {
  contentCaps.resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  contentCaps.resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('routes content action proof issuance through the action kernel', () => {
  const sendResponse = vi.fn();
  const message = createContentProofRequest();

  expect(handleBackgroundOwnedAction(createAction(sendResponse, undefined, message))).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    trustedEventProof: { proofToken: 'content-token-1' },
  });
});

it('rejects unauthorized content action proof issuance before routing', () => {
  const sendResponse = vi.fn();
  const sensitiveRequestId = 'sensitive-request-id-sentinel';
  const sensitiveSenderUrl = 'https://example.test/page?private=sender-sentinel';
  const action = createAction(
    sendResponse,
    { frameId: 0, url: sensitiveSenderUrl },
    createContentProofRequest(sensitiveRequestId)
  );

  expect(handleBackgroundOwnedAction(action)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action capability sender',
    success: false,
  });
  expect(action.context.logger.warn).toHaveBeenCalledWith(
    'Rejected background-owned runtime message'
  );
  const serializedLogs = JSON.stringify(vi.mocked(action.context.logger.warn).mock.calls);
  expect(serializedLogs).not.toContain(sensitiveRequestId);
  expect(serializedLogs).not.toContain(sensitiveSenderUrl);
});

it('routes content action capability issuance and closes the response channel', () => {
  const sendResponse = vi.fn();

  expect(handleBackgroundOwnedAction(createAction(sendResponse))).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    contentIntent: { requestId: 'content-request-1', token: 'content-token-1' },
    success: true,
  });
});

it('rejects unauthorized content action capability issuance before routing', () => {
  const sendResponse = vi.fn();

  expect(handleBackgroundOwnedAction(createAction(sendResponse, { frameId: 0 }))).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action capability sender',
    success: false,
  });
});

it('rejects content action issuance when route context does not match the dispatched message', () => {
  const sendResponse = vi.fn();
  const action = createAction(sendResponse);
  const authorization = authorizeIPCMessage({
    kind: 'background-owned',
    message: action.message,
    sender: action.context.sender,
  });
  if (!authorization.authorized) {
    throw new Error('Expected content action authorization to succeed');
  }
  const routeContext = getBackgroundOwnedRouteContext(authorization.preauthorization);
  const message = {
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    activationProof: { expiresAtEpochMs: 1_000, keyId: 'key-1', secret: 'secret-1' },
    requestId: 'content-request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };

  expect(dispatchBackgroundOwnedRoute({ ...action, message }, routeContext)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action runtime sender',
    success: false,
  });
});
