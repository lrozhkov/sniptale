import { beforeEach, expect, it, describe } from 'vitest';
import {
  browserTabsQueryMock,
  createSendResponse,
  createSender,
  createTopLevelContentSender,
  expectListenerResult,
  flushPromises,
  isBackgroundTabMessageMock,
  isRouteCaptureMessageMock,
  isScenarioMessageMock,
  isTabModeMessageMock,
  isVideoControlMessageMock,
  loggerErrorMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeCaptureMessageMock,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
  routeVideoControlMessageMock,
  sendTabMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const CONTENT_URL = 'https://example.test/page';

async function verifiesTabModeRoutingWithSenderTabId() {
  const { deps, listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({
    tabId: 99,
    type: MessageType.ENABLE_SCREENSHOT_MODE,
  });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isTabModeMessageMock.mockReturnValue(true);
  routeTabModeMessageMock.mockReturnValue(true);
  expectListenerResult(
    true,
    listener,
    { tabId: 99, type: MessageType.ENABLE_SCREENSHOT_MODE },
    createTopLevelContentSender(17, CONTENT_URL),
    sendResponse
  );
  await flushPromises();
  expect(routeTabModeMessageMock).toHaveBeenCalledWith({
    message: { tabId: 17, type: MessageType.ENABLE_SCREENSHOT_MODE },
    resolvedTabId: 17,
    senderDocumentId: 'document-17',
    sendResponse,
    screenshotModeState: deps.screenshotModeState,
    highlighterModeState: deps.highlighterModeState,
    quickEditModeState: deps.quickEditModeState,
    viewportOwnerState: deps.viewportOwnerState,
    viewportState: deps.viewportState,
    webSnapshotViewerPorts: deps.webSnapshotViewerPorts,
  });
}

async function verifiesCaptureRoutingWithExplicitTargetTab() {
  const { deps, listener, sendResponse } = registerListener();
  const message = { actionId: 'quick-1', tabId: 44, type: 'TRIGGER_QUICK_ACTION' };
  const sender = createSender(undefined, POPUP_URL);
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isRouteCaptureMessageMock.mockReturnValue(true);
  routeCaptureMessageMock.mockReturnValue(true);
  expectListenerResult(true, listener, message, sender, sendResponse);
  await flushPromises();
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
  expect(routeCaptureMessageMock).toHaveBeenCalledWith({
    message,
    pageAccessPort: expect.objectContaining({
      ensureActivePageAccessRuntime: expect.any(Function),
    }),
    resolvedTabId: 44,
    sendResponse,
    viewportState: deps.viewportState,
    screenshotModeState: deps.screenshotModeState,
    captureGuardState: deps.captureGuardState,
    scenarioSessionService: deps.scenarioSessionService,
    sender,
    webSnapshotViewerPorts: deps.webSnapshotViewerPorts,
  });
}

async function verifiesScenarioRoutingWithResolvedTabId() {
  const { deps, listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({
    type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT,
  });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isScenarioMessageMock.mockReturnValue(true);
  routeScenarioMessageMock.mockReturnValue(true);
  expectListenerResult(
    true,
    listener,
    { type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT },
    createTopLevelContentSender(23, CONTENT_URL),
    sendResponse
  );
  await flushPromises();
  expect(routeScenarioMessageMock).toHaveBeenCalledWith({
    message: { type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT },
    resolvedTabId: 23,
    scenarioSessionService: deps.scenarioSessionService,
    sendResponse,
  });
}

async function verifiesOwnedViewerSenderUrlRouting() {
  const { deps, listener, sendResponse } = registerListener();
  const viewerUrl =
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1';
  parseBackgroundRuntimeMessageMock.mockReturnValue({
    type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
    sidebarVisible: true,
  });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isScenarioMessageMock.mockReturnValue(true);
  routeScenarioMessageMock.mockReturnValue(true);
  browserTabsQueryMock.mockResolvedValue([{ id: 51, url: viewerUrl }]);

  expectListenerResult(
    true,
    listener,
    { type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE, sidebarVisible: true },
    createSender(undefined, viewerUrl),
    sendResponse
  );
  await flushPromises();

  expect(browserTabsQueryMock).toHaveBeenCalledWith({ url: viewerUrl });
  expect(routeScenarioMessageMock).toHaveBeenCalledWith({
    message: { type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE, sidebarVisible: true },
    resolvedTabId: 51,
    scenarioSessionService: deps.scenarioSessionService,
    sendResponse,
  });
}

async function verifiesPageStyleRuntimeRouting() {
  const { listener, sendResponse } = registerListener();
  const message = { tabId: 71, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY };
  browserTabsQueryMock.mockResolvedValue([{ id: 17 }]);
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  sendTabMessageMock.mockResolvedValue({
    summary: { activeAppliedCount: 0, matchedRules: [], pageUrl: 'https://example.test/page' },
    success: true,
  });

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(sendTabMessageMock).toHaveBeenCalledWith(17, {
    tabId: 17,
    type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
  });
  expect(sendTabMessageMock).not.toHaveBeenCalledWith(71, expect.anything());
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
}

async function verifiesVideoControlAndMissingTabFallbacks() {
  const { listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: VideoMessageType.START_RECORDING });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  expectListenerResult(
    true,
    listener,
    { type: VideoMessageType.START_RECORDING },
    createTopLevelContentSender(88, CONTENT_URL),
    sendResponse
  );
  await flushPromises();
  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized video-control route sender',
    success: false,
  });

  resetRuntimeMessagingMocks();
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: MessageType.ENABLE_SCREENSHOT_MODE });
  isBackgroundTabMessageMock.mockReturnValue(true);
  const noTabResponse = createSendResponse();
  expectListenerResult(
    true,
    listener,
    { type: MessageType.ENABLE_SCREENSHOT_MODE },
    createSender(),
    noTabResponse
  );
  await flushPromises();
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
  expect(noTabResponse).toHaveBeenCalledWith({ success: false, error: 'No tab ID' });
}

async function verifiesPopupVideoControlUsesRequestTabId() {
  const { listener } = registerListener();
  const popupResponse = createSendResponse();
  const popupStartMessage = { tabId: 77, type: VideoMessageType.START_RECORDING };
  parseBackgroundRuntimeMessageMock.mockReturnValue(popupStartMessage);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  expectListenerResult(
    true,
    listener,
    popupStartMessage,
    createSender(undefined, POPUP_URL),
    popupResponse
  );
  await flushPromises();
  expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
    message: popupStartMessage,
    pageAccessPort: expect.objectContaining({
      ensureActivePageAccessRuntime: expect.any(Function),
    }),
    resolvedTabId: 77,
    sendResponse: popupResponse,
    sender: { url: POPUP_URL },
  });
}

async function verifiesAsyncResolutionFailure() {
  const { listener, sendResponse } = registerListener();
  const viewerUrl =
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1';
  parseBackgroundRuntimeMessageMock.mockReturnValue({
    type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
    sidebarVisible: true,
  });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isScenarioMessageMock.mockReturnValue(true);
  browserTabsQueryMock.mockRejectedValue(new Error('tab lookup failed'));
  expectListenerResult(
    true,
    listener,
    { type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE, sidebarVisible: true },
    createSender(undefined, viewerUrl),
    sendResponse
  );
  await flushPromises();
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'tab lookup failed' });
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Background runtime message handling failed',
    expect.any(Error)
  );
}

describe('index.runtime-messaging routing', () => {
  beforeEach(resetRuntimeMessagingMocks);

  it('routes tab-mode messages with the sender tab id', verifiesTabModeRoutingWithSenderTabId);
  it('routes capture messages with explicit tab', verifiesCaptureRoutingWithExplicitTargetTab);
  it('routes scenario messages', verifiesScenarioRoutingWithResolvedTabId);
  it('resolves owned viewer senders', verifiesOwnedViewerSenderUrlRouting);
  it('routes page style runtime messages to the content tab', verifiesPageStyleRuntimeRouting);
  it(
    'rejects content video control messages and reports missing tab ids',
    verifiesVideoControlAndMissingTabFallbacks
  );
  it(
    'routes popup video control messages with their request tab id',
    verifiesPopupVideoControlUsesRequestTabId
  );
  it('returns async resolution errors through sendResponse', verifiesAsyncResolutionFailure);
});
