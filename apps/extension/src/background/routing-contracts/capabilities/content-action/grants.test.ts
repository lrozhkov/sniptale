import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeContentPrivilegedActionCapability,
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionCapabilityRequest,
} from './route';
import { issueFullPageExportContentIntentGrant } from './grants';
import { resolveContentSenderBindingForTest } from './test-support';

function contentSender(): chrome.runtime.MessageSender {
  return {
    documentId: 'content-doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('issues the full-page export content-intent grant for popup export flows', () => {
  const grant = issueFullPageExportContentIntentGrant(7);
  const sendResponse = vi.fn();

  expect(
    routeContentPrivilegedActionCapabilityRequest(
      {
        actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        requestId: 'full-page-request-1',
        source: { grantToken: grant.grantToken, kind: 'background-auto-start' },
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
      },
      contentSender(),
      sendResponse,
      resolveContentSenderBindingForTest(contentSender())
    )
  ).toBe(true);

  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
  };
  expect(
    consumeContentPrivilegedActionCapability({
      actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      contentIntent: response.contentIntent,
      resolvedTabId: 7,
      sender: contentSender(),
    })
  ).toBe(true);
});
