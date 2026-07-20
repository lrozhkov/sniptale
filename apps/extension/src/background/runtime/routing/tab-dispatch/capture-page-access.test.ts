import { beforeEach, expect, it } from 'vitest';
import {
  createSender,
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
import { routeAuthorizedTabAction as handleTabMessage } from './adapters/dispatcher';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';

beforeEach(() => {
  resetRuntimeMessagingMocks();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  hasActivePageAccessMock.mockResolvedValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);
  routeCaptureMessageMock.mockReturnValue(true);
});

it('rejects content capture routes without page access before capture side effects', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  hasActivePageAccessMock.mockResolvedValue(false);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: {
      type: MessageType.EXECUTE_SAVE,
      actionType: 'download_default',
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(hasActivePageAccessMock).toHaveBeenCalledWith(17);
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('does not burn content intent when page access is inactive', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  hasActivePageAccessMock.mockResolvedValue(false);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: {
      type: MessageType.EXECUTE_SAVE,
      actionType: 'download_default',
      contentIntent: { requestId: 'stale-request', token: 'stale-token' },
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
});

it('rejects invalid content intent before refreshing active page access', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: {
      type: MessageType.EXECUTE_SAVE,
      actionType: 'download_default',
      contentIntent: { requestId: 'stale-request', token: 'stale-token' },
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
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

it('rejects unauthorized content capture before refreshing active page access', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: {
      type: MessageType.EXECUTE_SAVE,
      actionType: 'download_default',
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
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

it('routes authorized popup capture messages without page access refresh', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.TRIGGER_QUICK_ACTION, actionId: 'action-1' },
    resolvedTabId: 17,
    sendResponse,
    sender: createSender(undefined, POPUP_URL),
  });

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: { type: MessageType.TRIGGER_QUICK_ACTION, actionId: 'action-1' },
      pageAccessPort: expect.objectContaining({
        ensureActivePageAccessRuntime: expect.any(Function),
      }),
      resolvedTabId: 17,
    })
  );
});

it('routes authorized content capture messages after verifying page access', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: {
      type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
    },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(hasActivePageAccessMock).toHaveBeenCalledWith(17);
  expect(routeCaptureMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccessPort: expect.objectContaining({
        ensureActivePageAccessRuntime: expect.any(Function),
      }),
      resolvedTabId: 17,
    })
  );
});

it('lets non-capture messages fall through without page access refresh', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  isRouteCaptureMessageMock.mockReturnValue(false);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ error: 'Unknown message type', success: false });
});
