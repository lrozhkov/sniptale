import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  browserTabsGetMock,
  hasActivePageAccessMock,
  hasPreauthorizedPopupTabRouteCapabilityRequestMessageMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  hasActivePageAccessMock: vi.fn(),
  hasPreauthorizedPopupTabRouteCapabilityRequestMessageMock: vi.fn(),
}));
import {
  assertPopupTabRouteCapability,
  resetPopupTabRouteCapabilitiesForTests,
  routePopupTabRouteCapabilityRequest,
} from './route-capabilities';

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const POPUP_HASH_URL = 'chrome-extension://test/apps/extension/src/popup/index.html#/export';

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: (...args: unknown[]) => browserTabsGetMock(...args),
  },
}));

vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
  hasActivePageAccess: (...args: unknown[]) => hasActivePageAccessMock(...args),
}));

vi.mock('./preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./preauthorization')>()),
  hasPreauthorizedPopupTabRouteCapabilityRequestMessage:
    hasPreauthorizedPopupTabRouteCapabilityRequestMessageMock,
}));

async function issueCapability(overrides: Partial<{ requestId: string; tabId: number }> = {}) {
  const sendResponse = vi.fn();
  routePopupTabRouteCapabilityRequest(
    {
      operation: MessageType.EXPORT_POPUP_PREVIEW,
      requestId: overrides.requestId ?? 'route-req-1',
      tabId: overrides.tabId ?? 7,
      type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
    },
    { url: POPUP_URL },
    sendResponse
  );
  await flushAsync();
  return sendResponse.mock.calls[0]?.[0] as { capabilityToken?: string; success: boolean };
}

beforeEach(() => {
  resetPopupTabRouteCapabilitiesForTests();
  browserTabsGetMock.mockReset();
  hasActivePageAccessMock.mockReset();
  hasPreauthorizedPopupTabRouteCapabilityRequestMessageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'https://example.test/page' });
  hasActivePageAccessMock.mockResolvedValue(true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-05T09:00:00.000Z'));
});

afterEach(() => {
  resetPopupTabRouteCapabilitiesForTests();
  vi.useRealTimers();
});

it('rejects non-popup senders when issuing capabilities', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedPopupTabRouteCapabilityRequestMessageMock.mockReturnValue(false);

  expect(
    routePopupTabRouteCapabilityRequest(
      {
        operation: MessageType.EXPORT_POPUP_PREVIEW,
        requestId: 'route-req-1',
        tabId: 7,
        type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
      },
      { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized tab route capability sender',
    success: false,
  });
});

it('ignores malformed capability requests before sender authorization', () => {
  const sendResponse = vi.fn();

  expect(routePopupTabRouteCapabilityRequest(null, { url: POPUP_URL }, sendResponse)).toBe(false);
  expect(routePopupTabRouteCapabilityRequest([], { url: POPUP_URL }, sendResponse)).toBe(false);
  expect(
    routePopupTabRouteCapabilityRequest(
      {
        operation: 'SCREENSHOT_CAPTURE',
        requestId: 'route-req-1',
        tabId: 7,
        type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
      },
      { url: POPUP_URL },
      sendResponse
    )
  ).toBe(false);

  expect(sendResponse).not.toHaveBeenCalled();
});

it('consumes matching capabilities once and rejects replay', async () => {
  const issued = await issueCapability();

  expect(issued.success).toBe(true);
  expect(() =>
    assertPopupTabRouteCapability({
      message: {
        tabId: 7,
        tabRouteCapabilityToken: issued.capabilityToken as string,
        tabRouteRequestId: 'route-req-1',
        type: MessageType.EXPORT_POPUP_PREVIEW,
      },
      senderUrl: POPUP_URL,
    })
  ).not.toThrow();
  expect(() =>
    assertPopupTabRouteCapability({
      message: {
        tabId: 7,
        tabRouteCapabilityToken: issued.capabilityToken as string,
        tabRouteRequestId: 'route-req-1',
        type: MessageType.EXPORT_POPUP_PREVIEW,
      },
      senderUrl: POPUP_URL,
    })
  ).toThrow('Invalid tab route capability');
});

it('accepts popup senders with document hash when issuing and consuming capabilities', async () => {
  const sendResponse = vi.fn();
  routePopupTabRouteCapabilityRequest(
    {
      operation: MessageType.EXPORT_POPUP_PREVIEW,
      requestId: 'route-req-hash',
      tabId: 7,
      type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
    },
    { url: POPUP_HASH_URL },
    sendResponse
  );
  await flushAsync();
  const issued = sendResponse.mock.calls[0]?.[0] as {
    capabilityToken?: string;
    success: boolean;
  };

  expect(issued.success).toBe(true);
  expect(() =>
    assertPopupTabRouteCapability({
      message: {
        tabId: 7,
        tabRouteCapabilityToken: issued.capabilityToken as string,
        tabRouteRequestId: 'route-req-hash',
        type: MessageType.EXPORT_POPUP_PREVIEW,
      },
      senderUrl: POPUP_HASH_URL,
    })
  ).not.toThrow();
});

it('rejects stale and mismatched capabilities', async () => {
  const stale = await issueCapability();
  vi.advanceTimersByTime(60_001);

  expect(() =>
    assertPopupTabRouteCapability({
      message: {
        tabId: 7,
        tabRouteCapabilityToken: stale.capabilityToken as string,
        tabRouteRequestId: 'route-req-1',
        type: MessageType.EXPORT_POPUP_PREVIEW,
      },
      senderUrl: POPUP_URL,
    })
  ).toThrow('Invalid tab route capability');

  const mismatched = await issueCapability({ tabId: 8 });
  expect(() =>
    assertPopupTabRouteCapability({
      message: {
        tabId: 7,
        tabRouteCapabilityToken: mismatched.capabilityToken as string,
        tabRouteRequestId: 'route-req-1',
        type: MessageType.EXPORT_POPUP_PREVIEW,
      },
      senderUrl: POPUP_URL,
    })
  ).toThrow('Invalid tab route capability');
});
