import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RouteCaptureMessage } from '../../../capture/routing';
import { authorizeIPCMessage } from './index';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionCapabilityRequest,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';
import {
  resetPopupTabRouteCapabilitiesForTests,
  routePopupTabRouteCapabilityRequest,
} from '../capabilities/popup-tab/route-capabilities';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const CONTENT_URL = 'https://example.test/page';
const OFFSCREEN_URL = 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html';
const { browserTabsGetMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function contentSender(tabId: number): chrome.runtime.MessageSender {
  return sender({
    documentId: `document-${tabId}`,
    frameId: 0,
    tabId,
    url: CONTENT_URL,
  });
}

function issueContentIntent(tabId: number) {
  const proofRequest = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: `${MessageType.EXPORT_CAPTURE_FULL_PAGE}-request-${tabId}`,
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(tabId), {
      actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      requestId: `${MessageType.EXPORT_CAPTURE_FULL_PAGE}-request-${tabId}`,
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    contentSender(tabId),
    proofResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected trusted-event proof');
  }

  const request = {
    actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    requestId: `${MessageType.EXPORT_CAPTURE_FULL_PAGE}-request-${tabId}`,
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    contentSender(tabId),
    sendResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );
  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
  };
  if (!response.contentIntent) {
    throw new Error('Expected content intent');
  }
  return response.contentIntent;
}

function captureMessage(tabId: number): RouteCaptureMessage {
  return {
    contentIntent: issueContentIntent(tabId),
    type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
  };
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

async function issuePopupCapability(tabId: number, requestId: string): Promise<string> {
  const sendResponse = vi.fn();
  const message = {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId,
    tabId,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  };
  const popupSender = sender({ url: POPUP_URL });
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message,
      sender: popupSender,
    })
  ).toEqual({ authorized: true });
  routePopupTabRouteCapabilityRequest(message, popupSender, sendResponse);
  await flushAsyncRoute();
  const response = sendResponse.mock.calls[0]?.[0] as { capabilityToken?: string };
  if (!response.capabilityToken) {
    throw new Error('Expected popup tab route capability token');
  }
  return response.capabilityToken;
}

beforeEach(() => {
  browserTabsGetMock.mockResolvedValue({
    id: 7,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });
  resetContentPrivilegedActionCapabilitiesForTests();
  resetPopupTabRouteCapabilitiesForTests();
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  resetPopupTabRouteCapabilitiesForTests();
});

it('authorizes privileged tab routes only for the resolved top-level content sender', () => {
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: captureMessage(7),
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: true });

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: captureMessage(7),
      resolvedTabId: 7,
      sender: contentSender(8),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized capture route sender' });

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: captureMessage(7),
      resolvedTabId: 7,
      sender: sender({ documentId: 'frame-doc', frameId: 2, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized capture route sender' });
});

it('requires one-shot popup tab route capabilities for popup export routes', async () => {
  const capabilityToken = await issuePopupCapability(7, 'route-req-1');
  const message = {
    tabId: 7,
    tabRouteCapabilityToken: capabilityToken,
    tabRouteRequestId: 'route-req-1',
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };

  expect(
    authorizeIPCMessage({
      kind: 'popup-export-tab-route',
      message,
      senderUrl: POPUP_URL,
    })
  ).toEqual({ authorized: true });

  expect(
    authorizeIPCMessage({
      kind: 'popup-export-tab-route',
      message,
      senderUrl: POPUP_URL,
    })
  ).toEqual({ authorized: false, reason: 'Invalid tab route capability' });
});

it('keeps offscreen-only runtime messages behind the offscreen document sender', () => {
  expect(
    authorizeIPCMessage({
      kind: 'offscreen-runtime',
      message: {
        duration: 12,
        recordingId: 'rec-1',
        type: VideoMessageType.RECORDING_DURATION_UPDATED,
      },
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized offscreen sender' });

  expect(
    authorizeIPCMessage({
      kind: 'offscreen-runtime',
      message: {
        duration: 12,
        recordingId: 'rec-1',
        type: VideoMessageType.RECORDING_DURATION_UPDATED,
      },
      sender: sender({ url: OFFSCREEN_URL }),
    })
  ).toEqual({ authorized: true });
});

it('does not require offscreen capability for non-offscreen runtime messages', () => {
  expect(
    authorizeIPCMessage({
      kind: 'offscreen-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: true });
});

it('fails closed for background-owned routes without policy or async dispatch', () => {
  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { type: 'UNMAPPED_BACKGROUND_ROUTE' },
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({
    authorized: false,
    reason: 'Missing background-owned IPC policy for UNMAPPED_BACKGROUND_ROUTE',
  });

  expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { type: MessageType.PROCESS_WITH_LLM },
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({
    authorized: false,
    reason: 'Async background-owned IPC authorization requires async dispatch',
  });
});
