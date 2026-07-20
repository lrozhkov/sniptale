import { beforeEach, expect, it } from 'vitest';
import {
  createSendResponse,
  createTopLevelContentSender,
  ensureActivePageAccessRuntimeMock,
  flushPromises,
  hasActivePageAccessMock,
  isRouteCaptureMessageMock,
  loggerErrorMock,
  loggerWarnMock,
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
import { routeAuthorizedTabAction as handleTabMessage } from '../tab-dispatch/adapters/dispatcher';

const CONTENT_URL = 'https://example.test/page';

function issueFullPageExportContentIntent() {
  const proofRequest = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: 'full-page-request-1',
    runtimeToken: issueContentActionRuntimeTokenForTest(
      createTopLevelContentSender(17, CONTENT_URL),
      {
        actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        requestId: 'full-page-request-1',
      }
    ),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = createSendResponse();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    createTopLevelContentSender(17, CONTENT_URL),
    proofResponse,
    resolveContentSenderBindingForTest(createTopLevelContentSender(17, CONTENT_URL))
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected full-page trusted-event proof');
  }

  const request = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: 'full-page-request-1',
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = createSendResponse();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    createTopLevelContentSender(17, CONTENT_URL),
    sendResponse,
    resolveContentSenderBindingForTest(createTopLevelContentSender(17, CONTENT_URL))
  );
  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
  };
  if (!response.contentIntent) {
    throw new Error('Expected full-page content intent');
  }
  return response.contentIntent;
}

beforeEach(() => {
  resetRuntimeMessagingMocks();
  resetContentPrivilegedActionCapabilitiesForTests();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  hasActivePageAccessMock.mockResolvedValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);
  routeCaptureMessageMock.mockReturnValue(true);
});

it('routes full-page export capture after page access refresh and content intent pass', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const contentIntent = issueFullPageExportContentIntent();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { contentIntent, type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, CONTENT_URL),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeCaptureMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: { contentIntent, type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
      resolvedTabId: 17,
    })
  );
});

it('rejects full-page export capture without content intent before refreshing access', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, CONTENT_URL),
  });
  await flushPromises();

  expect(hasActivePageAccessMock).toHaveBeenCalledWith(17);
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized content action capability',
    success: false,
  });
});

it('does not dispatch full-page export capture when page-access refresh fails', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const contentIntent = issueFullPageExportContentIntent();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('runtime refresh failed'));

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { contentIntent, type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, CONTENT_URL),
  });
  await flushPromises();

  expect(hasActivePageAccessMock).toHaveBeenCalledWith(17);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'runtime refresh failed',
    success: false,
  });
});

it('does not burn full-page export intent when page access is inactive', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const contentIntent = issueFullPageExportContentIntent();
  const message = { contentIntent, type: MessageType.EXPORT_CAPTURE_FULL_PAGE };
  hasActivePageAccessMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message,
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, CONTENT_URL),
  });
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();

  sendResponse.mockClear();
  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message,
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, CONTENT_URL),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeCaptureMessageMock).toHaveBeenCalledWith(expect.objectContaining({ message }));
});
