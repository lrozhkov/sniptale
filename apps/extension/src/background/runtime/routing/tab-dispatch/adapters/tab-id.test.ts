import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { resolveTabIdPromise } from './tab-id';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const browserTabsQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { query: browserTabsQueryMock },
}));

function createSender(props: { tabId?: number; url?: string }): chrome.runtime.MessageSender {
  return {
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

beforeEach(() => {
  browserTabsQueryMock.mockReset();
  browserTabsQueryMock.mockResolvedValue([{ id: 17 }]);
});

it('resolves popup page-style messages to the active tab instead of the caller tab id', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 61, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY },
      createSender({ url: POPUP_URL })
    )
  ).resolves.toBe(17);
  expect(browserTabsQueryMock).toHaveBeenCalledWith({ active: true, currentWindow: true });
});

it('uses the popup sender tab instead of a caller-provided tab id', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 61, type: MessageType.ENABLE_SCREENSHOT_MODE },
      createSender({ tabId: 17, url: POPUP_URL })
    )
  ).resolves.toBe(17);
});

it('does not resolve active tabs for popup recording controls without sender tab ids', async () => {
  await expect(
    resolveTabIdPromise(
      { type: VideoMessageType.PAUSE_RECORDING },
      createSender({ url: POPUP_URL })
    )
  ).resolves.toBeUndefined();
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
});

it('preserves explicit popup tab ids for non-current-tab route families', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 77, type: VideoMessageType.START_RECORDING },
      createSender({ url: POPUP_URL })
    )
  ).resolves.toBe(77);
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
});
