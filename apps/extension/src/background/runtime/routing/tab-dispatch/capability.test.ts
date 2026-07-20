import { beforeEach, expect, it } from 'vitest';

import {
  browserTabsGetMock,
  browserTabsQueryMock,
  createSender,
  createSendResponse,
  ensureActivePageAccessRuntimeMock,
  expectListenerResult,
  flushPromises,
  hasActivePageAccessMock,
  isBackgroundTabMessageMock,
  isPopupExportViewerMessageMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  resetPopupTabRouteCapabilitiesForTests,
  routePopupTabRouteCapabilityRequest,
} from '../capabilities/popup-tab/route-capabilities';
import { markPreauthorizedPopupTabRouteCapabilityRequestMessage } from '../capabilities/popup-tab/preauthorization';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';

async function issuePopupExportRouteCapability(tabId: number, requestId: string): Promise<string> {
  const sendResponse = createSendResponse();
  const message = {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId,
    tabId,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  };
  markPreauthorizedPopupTabRouteCapabilityRequestMessage(message);
  routePopupTabRouteCapabilityRequest(message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();
  const response = sendResponse.mock.calls[0]?.[0] as { capabilityToken?: string };
  if (!response.capabilityToken) {
    throw new Error('Expected capability token');
  }
  return response.capabilityToken;
}

beforeEach(() => {
  resetRuntimeMessagingMocks();
  resetPopupTabRouteCapabilitiesForTests();
  browserTabsGetMock.mockResolvedValue({ id: 61, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  hasActivePageAccessMock.mockResolvedValue(true);
});

it('routes popup export messages only with a matching tab route capability', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    tabId: 61,
    tabRouteCapabilityToken: await issuePopupExportRouteCapability(61, 'route-req-1'),
    tabRouteRequestId: 'route-req-1',
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isPopupExportViewerMessageMock.mockReturnValue(true);
  sendTabMessageMock.mockResolvedValue({
    preview: {
      context: 'example.test',
      jsonPreview: '{}',
      markdownPreview: '# Example',
      rowsCount: 0,
      sectionsCount: 0,
      title: 'Example',
    },
    success: true,
  });

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(sendTabMessageMock).toHaveBeenCalledWith(61, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    61,
    'Page access is required for export.'
  );
  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('prefers popup export capabilities over extension page sender tabs', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    tabId: 61,
    tabRouteCapabilityToken: await issuePopupExportRouteCapability(61, 'route-req-tab'),
    tabRouteRequestId: 'route-req-tab',
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isPopupExportViewerMessageMock.mockReturnValue(true);
  sendTabMessageMock.mockResolvedValue({
    preview: {
      context: 'example.test',
      jsonPreview: '{}',
      markdownPreview: '# Example',
      rowsCount: 0,
      sectionsCount: 0,
      title: 'Example',
    },
    success: true,
  });

  expectListenerResult(true, listener, message, createSender(999, POPUP_URL), sendResponse);
  await flushPromises();

  expect(sendTabMessageMock).toHaveBeenCalledWith(61, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    61,
    'Page access is required for export.'
  );
  expect(sendTabMessageMock).not.toHaveBeenCalledWith(999, expect.anything());
});

it('routes popup page-style messages to the active tab instead of caller tab ids', async () => {
  const { listener, sendResponse } = registerListener();
  const message = { tabId: 61, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY };
  browserTabsQueryMock.mockResolvedValue([{ id: 17 }]);
  browserTabsGetMock.mockResolvedValue({ id: 17, url: 'https://example.test/page' });
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  sendTabMessageMock.mockResolvedValue({
    success: true,
    summary: { activeAppliedCount: 2 },
  });

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(sendTabMessageMock).toHaveBeenCalledWith(17, {
    tabId: 17,
    type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
  });
  expect(sendTabMessageMock).not.toHaveBeenCalledWith(61, expect.anything());
  expect(sendResponse).toHaveBeenCalledWith({ success: true, summary: { activeAppliedCount: 2 } });
});

it('rejects non-popup extension pages that submit popup export tab ids', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    tabId: 61,
    tabRouteCapabilityToken: await issuePopupExportRouteCapability(61, 'route-req-1'),
    tabRouteRequestId: 'route-req-1',
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isPopupExportViewerMessageMock.mockReturnValue(true);

  expectListenerResult(
    true,
    listener,
    message,
    createSender(undefined, 'chrome-extension://test/apps/extension/src/settings/index.html'),
    sendResponse
  );
  await flushPromises();

  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Invalid tab route capability',
    success: false,
  });
});
