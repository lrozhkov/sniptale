import { expect, it, vi } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RouteCaptureMessage } from '../../../capture/routing';
import {
  canRouteCaptureMessageFromSender,
  getUnauthorizedPrivilegedTabRouteSenderReason,
} from './sender-policy';

const runtimeInfoGetUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeInfoGetUrlMock,
  },
}));

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const EDITOR_URL = 'chrome-extension://test/apps/extension/src/editor/index.html?session=s1';
const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';
const VIEWER_URL =
  'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1';

function createTab(tabId: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: tabId,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    status: 'complete',
    title: 'Example',
    url: 'https://example.test',
    windowId: 1,
  };
}

function createSender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: createTab(props.tabId) }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function createTopLevelContentSender(tabId = 7): chrome.runtime.MessageSender {
  return createSender({
    documentId: `document-${tabId}`,
    frameId: 0,
    tabId,
    url: 'https://example.test/page',
  });
}

function canRoute(message: RouteCaptureMessage, sender: chrome.runtime.MessageSender): boolean {
  return canRouteCaptureMessageFromSender({ message, resolvedTabId: 7, sender });
}

it('allows capture messages from the resolved sender tab', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    canRoute({ type: CaptureMessageType.CAPTURE_VISIBLE }, createTopLevelContentSender())
  ).toBe(true);
  expect(
    canRoute(
      { type: CaptureMessageType.CAPTURE_VISIBLE },
      createSender({ tabId: 8, url: POPUP_URL })
    )
  ).toBe(false);
  expect(
    canRoute(
      { type: CaptureMessageType.CAPTURE_VISIBLE },
      createSender({ tabId: 7, url: SETTINGS_URL })
    )
  ).toBe(false);
});

it('rejects privileged content routes from iframe or document-less senders', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
  const message = { type: CaptureMessageType.CAPTURE_VISIBLE };

  expect(
    canRoute(
      message,
      createSender({
        documentId: 'iframe-document',
        frameId: 4,
        tabId: 7,
        url: 'https://example.test/frame',
      })
    )
  ).toBe(false);
  expect(
    canRoute(message, createSender({ frameId: 0, tabId: 7, url: 'https://example.test/page' }))
  ).toBe(false);
  expect(
    canRoute(
      message,
      createSender({ documentId: 'document-7', tabId: 7, url: 'https://example.test/page' })
    )
  ).toBe(false);
});

it('applies top-level content proof to non-capture privileged route families', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'page-style',
      resolvedTabId: 7,
      sender: createTopLevelContentSender(),
    })
  ).toBeNull();
  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'scenario',
      resolvedTabId: 7,
      sender: createSender({
        documentId: 'iframe-document',
        frameId: 2,
        tabId: 7,
        url: 'https://example.test/frame',
      }),
    })
  ).toBe('Unauthorized scenario route sender');
  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'tab-mode',
      resolvedTabId: 7,
      sender: createSender({ frameId: 0, tabId: 7, url: 'https://example.test/page' }),
    })
  ).toBe('Unauthorized tab-mode route sender');
});

it('keeps video-control privileged tab routes popup-only', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'video-control',
      resolvedTabId: 7,
      sender: createSender({ url: POPUP_URL }),
    })
  ).toBeNull();
  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'video-control',
      resolvedTabId: 7,
      sender: createTopLevelContentSender(),
    })
  ).toBe('Unauthorized video-control route sender');
});

it('allows only popup quick-action targeted capture routes without a sender tab', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    canRoute(
      { actionId: 'quick-1', tabId: 7, type: 'TRIGGER_QUICK_ACTION' },
      createSender({ url: POPUP_URL })
    )
  ).toBe(true);
  expect(
    canRoute({ type: MessageType.EXPORT_CAPTURE_FULL_PAGE }, createSender({ url: POPUP_URL }))
  ).toBe(false);
});

it('allows owned snapshot viewer routes and rejects unrelated extension pages', () => {
  runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);

  expect(
    canRoute(
      {
        snapshotSessionId: 'snapshot-session-1',
        type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
        url: 'https://example.test/asset.png',
      },
      createSender({ url: VIEWER_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      { actionId: 'quick-1', tabId: 7, type: 'TRIGGER_QUICK_ACTION' },
      createSender({ url: SETTINGS_URL })
    )
  ).toBe(false);
});

it('allows editor save routes without allowing arbitrary editor capture routes', () => {
  runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);

  expect(
    canRoute(
      {
        actionType: 'download_default',
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        type: MessageType.EXECUTE_SAVE,
      },
      createSender({ tabId: 7, url: EDITOR_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      { type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
      createSender({ tabId: 7, url: EDITOR_URL })
    )
  ).toBe(false);
});
