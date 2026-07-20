import { beforeEach, expect, it, vi } from 'vitest';
import {
  browserScriptingExecuteScriptMock,
  browserTabsGetMock,
  createSender,
  expectListenerResult,
  flushPromises,
  isBackgroundTabMessageMock,
  isPopupExportViewerMessageMock,
  loadSettingsMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  sendViewerPopupExportMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  registerWebSnapshotAssetSession,
  resetWebSnapshotAssetSessionsForTests,
} from '../../../capture/routing/web-snapshot/session';
import {
  resetPopupTabRouteCapabilitiesForTests,
  routePopupTabRouteCapabilityRequest,
} from '../capabilities/popup-tab/route-capabilities';
import { markPreauthorizedPopupTabRouteCapabilityRequestMessage } from '../capabilities/popup-tab/preauthorization';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';

async function issueWebSnapshotSaveCapability(tabId: number, requestId: string): Promise<string> {
  const sendResponse = vi.fn();
  const message = {
    operation: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
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
  resetWebSnapshotAssetSessionsForTests();
});

it('routes web snapshot saves through content tabs and authorizes asset sessions', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    requestId: 'req-web',
    tabRouteCapabilityToken: await issueWebSnapshotSaveCapability(62, 'req-web'),
    tabRouteRequestId: 'req-web',
    tabId: 62,
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isPopupExportViewerMessageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  loadSettingsMock.mockResolvedValueOnce({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
  });
  browserScriptingExecuteScriptMock.mockResolvedValue([
    { frameId: 0, result: { assetId: 'snapshot-1', success: true, warnings: [] } },
  ]);

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      args: [
        expect.objectContaining({
          request: expect.objectContaining({
            allowAnonymousCrossOriginAssets: true,
            allowAuthenticatedSameOriginAssets: false,
            requestId: 'req-web',
          }),
        }),
      ],
      target: { frameIds: [0], tabId: 62 },
    })
  );
  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'snapshot-1',
    success: true,
    warnings: [],
  });
  expect(() => registerWebSnapshotAssetSession(62, 'req-web', [])).not.toThrow();
});

it('binds anonymous external asset authorization to the persisted setting', async () => {
  const { listener, sendResponse } = registerListener();
  const message = {
    requestId: 'req-disabled',
    tabRouteCapabilityToken: await issueWebSnapshotSaveCapability(62, 'req-disabled'),
    tabRouteRequestId: 'req-disabled',
    tabId: 62,
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isPopupExportViewerMessageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  loadSettingsMock.mockResolvedValueOnce({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: true,
  });
  browserScriptingExecuteScriptMock.mockResolvedValue([
    { frameId: 0, result: { assetId: 'snapshot-1', success: true, warnings: [] } },
  ]);

  expectListenerResult(true, listener, message, createSender(undefined, POPUP_URL), sendResponse);
  await flushPromises();

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      args: [
        expect.objectContaining({
          request: expect.objectContaining({
            allowAnonymousCrossOriginAssets: false,
            allowAuthenticatedSameOriginAssets: true,
            requestId: 'req-disabled',
          }),
        }),
      ],
      target: { frameIds: [0], tabId: 62 },
    })
  );
  expect(() =>
    registerWebSnapshotAssetSession(62, 'req-disabled', ['https://cdn.example.com/image.png'])
  ).toThrow('anonymous cross-origin asset fetch is disabled');
});
