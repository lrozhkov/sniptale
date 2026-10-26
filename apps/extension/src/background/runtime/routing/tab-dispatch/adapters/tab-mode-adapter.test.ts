import { beforeEach, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  browserTabsGetMock,
  createSendResponse,
  createTopLevelContentSender,
  ensureActivePageAccessRuntimeMock,
  hasActivePageAccessMock,
  flushPromises,
  isTabModeMessageMock,
  loggerErrorMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeTabModeMessageMock,
} from '../../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { routeResolvedTabModeMessage } from './tab-mode-adapter';
import { routeWithPageAccess, routeWithVerifiedPageAccess } from './page-access-guard';
import { vi } from 'vitest';
function statusArgs() {
  const { deps } = registerListener();
  return {
    deps,
    logger: { error: loggerErrorMock },
    message: { type: MessageType.SCREENSHOT_MODE_STATUS },
    resolvedTabId: 17,
    sendResponse: createSendResponse(),
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  };
}
beforeEach(() => {
  resetRuntimeMessagingMocks();
  isTabModeMessageMock.mockReturnValue(true);
  routeTabModeMessageMock.mockReturnValue(true);
});
it('reads status after host release without injecting the full runtime again', async () => {
  routeResolvedTabModeMessage(statusArgs());
  await flushPromises();
  expect(routeTabModeMessageMock).toHaveBeenCalledOnce();
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(hasActivePageAccessMock).toHaveBeenCalledWith(17);
});
it('refuses status without current page access and preserves the no-injection rule', async () => {
  hasActivePageAccessMock.mockResolvedValue(false);
  const args = statusArgs();
  routeResolvedTabModeMessage(args);
  await flushPromises();
  expect(routeTabModeMessageMock).not.toHaveBeenCalled();
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});
it('keeps runtime refresh for authorized tab-mode mutations', async () => {
  const args = statusArgs();
  routeResolvedTabModeMessage({ ...args, message: { type: MessageType.ENABLE_HIGHLIGHTER_MODE } });
  await flushPromises();
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(17);
  expect(routeTabModeMessageMock).toHaveBeenCalledOnce();
});

it('does not recreate a closed toolbar for its delayed preset availability read', async () => {
  const args = statusArgs();
  routeResolvedTabModeMessage({
    ...args,
    message: { type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY, presetIds: [] },
  });
  await flushPromises();
  expect(routeTabModeMessageMock).toHaveBeenCalledOnce();
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
});

it('does not route a non-tab message or an unauthorized content sender', async () => {
  const args = statusArgs();
  isTabModeMessageMock.mockReturnValueOnce(false);
  expect(routeResolvedTabModeMessage(args)).toBe(false);
  routeResolvedTabModeMessage({
    ...args,
    sender: {
      ...createTopLevelContentSender(17, 'https://example.test'),
      frameId: 2,
      documentId: 'child',
    },
  });
  await flushPromises();
  expect(routeTabModeMessageMock).not.toHaveBeenCalled();
});
it('retains the snapshot-viewer exception without loading content', async () => {
  browserTabsGetMock.mockResolvedValue({
    id: 17,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=proof',
  });
  routeResolvedTabModeMessage(statusArgs());
  await flushPromises();
  expect(routeTabModeMessageMock).toHaveBeenCalledOnce();
  expect(hasActivePageAccessMock).not.toHaveBeenCalled();
});
it('reports read and refresh failures without routing side effects', async () => {
  const args = statusArgs();
  browserTabsGetMock.mockRejectedValueOnce(new Error('tab closed'));
  routeResolvedTabModeMessage(args);
  await flushPromises();
  expect(args.sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  ensureActivePageAccessRuntimeMock.mockRejectedValueOnce(new Error('injection refused'));
  routeWithPageAccess(args, routeTabModeMessageMock);
  await flushPromises();
  expect(routeTabModeMessageMock).not.toHaveBeenCalled();
});
it('checks verified authorization before refreshing and supports the accepted route', async () => {
  const args = statusArgs(),
    route = vi.fn(() => true);
  routeWithVerifiedPageAccess(args, () => false, route);
  await flushPromises();
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(route).not.toHaveBeenCalled();
  routeWithVerifiedPageAccess(args, () => true, route);
  await flushPromises();
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledOnce();
  expect(route).toHaveBeenCalledOnce();
});
