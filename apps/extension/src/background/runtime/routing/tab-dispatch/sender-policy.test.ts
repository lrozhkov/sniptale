import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  createSender,
  createSendResponse,
  createTopLevelContentSender,
  expectListenerResult,
  flushPromises,
  isBackgroundTabMessageMock,
  isRouteCaptureMessageMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeCaptureMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionCapabilityRequest,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';

function issueFullPageContentIntent(tabId: number) {
  const sender = createTopLevelContentSender(tabId, 'https://example.test/page');
  const proofRequest = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: `full-page-request-${tabId}`,
    runtimeToken: issueContentActionRuntimeTokenForTest(sender, {
      actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      requestId: `full-page-request-${tabId}`,
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = createSendResponse();
  routeContentPrivilegedActionProofRequest(
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

  const request = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: `full-page-request-${tabId}`,
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = createSendResponse();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    sender,
    sendResponse,
    resolveContentSenderBindingForTest(sender)
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
  resetRuntimeMessagingMocks();
  resetContentPrivilegedActionCapabilitiesForTests();
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
});

it('allows content-tab capture routes from the sender tab', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    contentIntent: issueFullPageContentIntent(44),
    type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);
  routeCaptureMessageMock.mockReturnValue(true);

  expectListenerResult(
    true,
    listener,
    message,
    createTopLevelContentSender(44, 'https://example.test/page'),
    sendResponse
  );
  await flushPromises();

  expect(routeCaptureMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ resolvedTabId: 44 })
  );
  expect(sendResponse).not.toHaveBeenCalledWith({
    error: 'Unauthorized capture route sender',
    success: false,
  });
});

it('rejects popup-targeted privileged capture routes before capture handlers', async () => {
  const { listener, sendResponse } = registerListener();
  const message = { tabId: 44, type: MessageType.EXPORT_CAPTURE_FULL_PAGE };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized capture route sender',
    success: false,
  });
});

it('rejects extension-page sender tabs before capture handlers', async () => {
  const { listener, sendResponse } = registerListener();
  const message = { type: MessageType.EXPORT_CAPTURE_FULL_PAGE };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, createSender(44, SETTINGS_URL), sendResponse);
  await flushPromises();

  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized capture route sender',
    success: false,
  });
});
