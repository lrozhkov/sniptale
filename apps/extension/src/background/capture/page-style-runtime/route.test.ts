import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';
import { isPageStyleRuntimeMessage, routePageStyleRuntimeMessage } from './route';

const mocks = vi.hoisted(() => ({
  browserTabsGet: vi.fn(),
  loggerError: vi.fn(),
  sendTabMessage: vi.fn(),
  sendResponse: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: mocks.browserTabsGet,
  },
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  getErrorMessage: (error: unknown, fallback = 'Unknown error') =>
    error instanceof Error ? error.message : fallback,
  sendTabMessage: mocks.sendTabMessage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  installBackgroundRuntimeMessagingMock({ sendTabMessage: mocks.sendTabMessage });
});

it('narrows page-style runtime messages by supported message type', () => {
  expect(isPageStyleRuntimeMessage({ type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY })).toBe(
    true
  );
  expect(isPageStyleRuntimeMessage({ type: MessageType.OPEN_PAGE_STYLE_INSPECTOR })).toBe(true);
  expect(isPageStyleRuntimeMessage({ type: MessageType.SCREENSHOT_MODE_STATUS })).toBe(false);
});

it('forwards page-style runtime messages to regular content tabs', async () => {
  const message = { tabId: 7, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY };
  mocks.browserTabsGet.mockResolvedValueOnce({ id: 7, url: 'https://example.test/page' });
  mocks.sendTabMessage.mockResolvedValueOnce({
    success: true,
    summary: { activeAppliedCount: 1, matchedRules: [], pageUrl: 'https://example.test/page' },
  });

  routePageStyleRuntimeMessage({
    logger: { error: mocks.loggerError },
    message,
    resolvedTabId: 7,
    sendResponse: mocks.sendResponse,
  });
  await flushAsyncRoute();

  expect(mocks.browserTabsGet).toHaveBeenCalledWith(7);
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(7, message);
  expect(mocks.sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, summary: expect.any(Object) })
  );
});

it('acknowledges extension editor tabs without sending a content-script page-style request', async () => {
  const message = { tabId: 11, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY };
  mocks.browserTabsGet.mockResolvedValueOnce({
    id: 11,
    url: 'chrome-extension://test/apps/extension/src/editor/index.html?session=s1',
  });

  routePageStyleRuntimeMessage({
    logger: { error: mocks.loggerError },
    message,
    resolvedTabId: 11,
    sendResponse: mocks.sendResponse,
  });
  await flushAsyncRoute();

  expect(mocks.browserTabsGet).toHaveBeenCalledWith(11);
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
  expect(mocks.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(mocks.loggerError).not.toHaveBeenCalled();
});

function flushAsyncRoute() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
