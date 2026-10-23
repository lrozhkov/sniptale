import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  normalizeResolvedTabMessage,
  rejectMissingResolvedTabId,
  resolveTabIdPromise,
} from './tab-id';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const browserTabsQueryMock = vi.hoisted(() => vi.fn());
const authorizeMock = vi.hoisted(() => vi.fn());

vi.mock('../../authorization/index', () => ({ authorizeIPCMessage: authorizeMock }));

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
  authorizeMock.mockReset();
  authorizeMock.mockReturnValue({ authorized: true });
  browserTabsQueryMock.mockReset();
  browserTabsQueryMock.mockResolvedValue([{ id: 17 }]);
});

it('admits an explicitly authorized export target ahead of the popup document tab', async () => {
  const message = { type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT, tabId: 61 };
  await expect(
    resolveTabIdPromise(message, createSender({ tabId: 17, url: POPUP_URL }))
  ).resolves.toBe(61);
  expect(authorizeMock).toHaveBeenCalledWith({
    kind: 'popup-export-tab-route',
    message,
    senderUrl: POPUP_URL,
  });
});

it('rejects an export target when its capability authorization fails', async () => {
  authorizeMock.mockReturnValueOnce({ authorized: false, reason: 'Unauthorized target' });
  await expect(
    resolveTabIdPromise(
      { type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT, tabId: 61 },
      createSender({ tabId: 17, url: POPUP_URL })
    )
  ).rejects.toThrow('Unauthorized target');
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
});

it('does not resolve an explicitly addressed export from a non-popup document without a tab', async () => {
  await expect(
    resolveTabIdPromise(
      { type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT, tabId: 61 },
      createSender({ url: 'https://example.test' })
    )
  ).resolves.toBeUndefined();
});

it('resolves current-tab popup actions from the active browser tab', async () => {
  await expect(
    resolveTabIdPromise(
      { type: MessageType.ENABLE_SCREENSHOT_MODE },
      createSender({ url: POPUP_URL })
    )
  ).resolves.toBe(17);
  expect(browserTabsQueryMock).toHaveBeenCalledWith({ active: true, currentWindow: true });
});

it('resolves an owned snapshot viewer from its actual browser document', async () => {
  const url =
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=one';
  browserTabsQueryMock.mockResolvedValueOnce([{ id: 29 }]);
  await expect(resolveTabIdPromise({}, createSender({ url }))).resolves.toBe(29);
  expect(browserTabsQueryMock).toHaveBeenCalledWith({ url });
});

it.each([null, {}, 'invalid'])(
  'does not select an active tab for malformed popup messages: %s',
  async (message) => {
    await expect(
      resolveTabIdPromise(message, createSender({ url: POPUP_URL }))
    ).resolves.toBeUndefined();
    expect(browserTabsQueryMock).not.toHaveBeenCalled();
  }
);

it('uses the popup sender tab instead of a caller-provided tab id', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 61, type: MessageType.ENABLE_SCREENSHOT_MODE },
      createSender({ tabId: 17, url: POPUP_URL })
    )
  ).resolves.toBe(17);
});

it('normalizes only messages that carry an explicit target', () => {
  const control = {
    type: VideoMessageType.PAUSE_RECORDING,
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  };
  expect(normalizeResolvedTabMessage(control, 17)).toBe(control);
  const start = {
    type: VideoMessageType.START_RECORDING,
    settings: DEFAULT_VIDEO_SETTINGS,
    tabId: 77,
  };
  expect(normalizeResolvedTabMessage(start, 17)).toEqual({ ...start, tabId: 17 });
  expect(start.tabId).toBe(77);
});

it('rejects missing routing targets and leaves resolved requests untouched', () => {
  const logger = { error: vi.fn(), warn: vi.fn() };
  const sendResponse = vi.fn();
  const message = {
    type: VideoMessageType.PAUSE_RECORDING,
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  };
  expect(rejectMissingResolvedTabId({ logger, sendResponse, message, resolvedTabId: 17 })).toBe(
    false
  );
  expect(sendResponse).not.toHaveBeenCalled();
  expect(
    rejectMissingResolvedTabId({ logger, sendResponse, message, resolvedTabId: undefined })
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({ success: false, error: 'No tab ID' });
  expect(logger.error).toHaveBeenCalledOnce();
});

it('preserves an explicit recording source when the trusted popup has its own extension tab', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 77, type: VideoMessageType.START_RECORDING },
      createSender({ tabId: 17, url: POPUP_URL })
    )
  ).resolves.toBe(77);
  expect(browserTabsQueryMock).not.toHaveBeenCalled();
});

it('keeps recording targets bound to the sender tab for content documents', async () => {
  await expect(
    resolveTabIdPromise(
      { tabId: 77, type: VideoMessageType.START_RECORDING },
      createSender({ tabId: 17, url: 'https://example.test' })
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
