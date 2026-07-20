import { beforeEach, expect, it } from 'vitest';
import {
  browserTabsGetMock,
  createSendResponse,
  createSender,
  createTopLevelContentSender,
  ensureActivePageAccessRuntimeMock,
  flushPromises,
  isPopupExportViewerMessageMock,
  isScenarioMessageMock,
  isTabModeMessageMock,
  isVideoControlMessageMock,
  loggerErrorMock,
  loggerWarnMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
  routeVideoControlMessageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeAuthorizedTabAction as handleTabMessage } from './adapters/dispatcher';
import { routeResolvedPopupExportMessage } from './adapters/popup-export-adapter';
import { rejectUnauthorizedRouteSender } from './adapters/sender-rejection';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';

beforeEach(() => {
  resetRuntimeMessagingMocks();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
});

it('routes popup recording control without a resolved tab id', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const sender = createSender(undefined, POPUP_URL);
  const message = {
    controlToken: 'control-1',
    recordingId: 'recording-1',
    type: VideoMessageType.STOP_RECORDING,
  };
  isVideoControlMessageMock.mockReturnValue(true);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message,
    resolvedTabId: undefined,
    sendResponse,
    sender,
  });

  expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
    message,
    resolvedTabId: undefined,
    sendResponse,
    sender,
  });
});

it('reports unhandled resolved tab messages', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const message = { type: MessageType.ENABLE_SCREENSHOT_MODE };

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message,
    resolvedTabId: 42,
    sendResponse,
    sender: createSender(undefined, POPUP_URL),
  });

  expect(loggerWarnMock).toHaveBeenCalledWith('Unhandled background tab message type', {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
  });
  expect(sendResponse).toHaveBeenCalledWith({ error: 'Unknown message type', success: false });
});

it('omits the viewer port registry when tab-mode deps omit it', async () => {
  const { deps } = registerListener();
  const { webSnapshotViewerPorts: _webSnapshotViewerPorts, ...depsWithoutViewerPorts } = deps;
  const sendResponse = createSendResponse();
  isTabModeMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(false);
  routeTabModeMessageMock.mockReturnValue(true);

  handleTabMessage({
    deps: depsWithoutViewerPorts,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  const routedArgs = routeTabModeMessageMock.mock.calls[0]?.[0];
  expect(routedArgs).toBeDefined();
  expect('webSnapshotViewerPorts' in routedArgs).toBe(false);
  expect(routedArgs.senderDocumentId).toBe('document-17');
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
});

it('rejects tab-mode routes without page access before owner side effects', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  isTabModeMessageMock.mockReturnValue(true);
  routeTabModeMessageMock.mockReturnValue(true);
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeTabModeMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('routes popup export adapter messages to the viewer owner', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  const message = {
    tabId: 17,
    tabRouteCapabilityToken: 'capability-1',
    tabRouteRequestId: 'request-1',
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };
  isPopupExportViewerMessageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({
    id: 17,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });

  expect(
    routeResolvedPopupExportMessage({
      deps,
      logger: { error: loggerErrorMock },
      message,
      resolvedTabId: 17,
      sendResponse,
      sender: createSender(undefined, POPUP_URL),
    })
  ).toBe(true);
  await flushPromises();

  expect(sendViewerPopupExportMessageMock).toHaveBeenCalledWith(deps.webSnapshotViewerPorts, 17, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('rejects page-style routes without page access before content side effects', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('rejects scenario routes without page access before scenario side effects', async () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();
  isScenarioMessageMock.mockReturnValue(true);
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message: { type: 'SCENARIO_GET_SESSION' },
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeScenarioMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('ignores non-popup export adapter messages', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  expect(
    routeResolvedPopupExportMessage({
      deps,
      logger: { error: loggerErrorMock },
      message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
      resolvedTabId: 17,
      sendResponse,
      sender: createTopLevelContentSender(17, 'https://example.test/page'),
    })
  ).toBe(false);
  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
});

it('returns sender-policy rejections before adapter side effects', () => {
  const { deps } = registerListener();
  const sendResponse = createSendResponse();

  expect(
    rejectUnauthorizedRouteSender(
      {
        deps,
        message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
        resolvedTabId: 17,
        sendResponse,
        sender: createSender(undefined, POPUP_URL),
      },
      'tab-mode'
    )
  ).toBe(false);

  expect(
    rejectUnauthorizedRouteSender(
      {
        deps,
        message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
        resolvedTabId: 17,
        sendResponse,
        sender: createSender(
          undefined,
          'chrome-extension://test/apps/extension/src/settings/index.html'
        ),
      },
      'tab-mode'
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized tab-mode route sender',
    success: false,
  });
});
