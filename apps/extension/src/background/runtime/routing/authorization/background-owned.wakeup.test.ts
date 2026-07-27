import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  getBackgroundOwnedRouteContext,
  getContentRuntimeWakeupSenderBinding,
} from '../../../routing-contracts/owned-route-context';
import { authorizeBackgroundOwnedRoute } from './background-owned';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';
import {
  issueContentPrivilegedActionCapability,
  resetContentPrivilegedActionCapabilityStoreForTests,
} from '../../../routing-contracts/capabilities/content-action/capability-store';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function contentRuntimeWakeupRequest(
  sender: chrome.runtime.MessageSender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  },
  pinToTab?: boolean,
  contentIntent?: { requestId: string; token: string }
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: { contentIntent, pinToTab, type: MessageType.CONTENT_RUNTIME_WAKEUP },
    sender,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetContentPrivilegedActionCapabilityStoreForTests();
});

it('authorizes content runtime wake-up with typed sender binding', () => {
  const authorizationRequest = contentRuntimeWakeupRequest();
  const authorization = authorizeBackgroundOwnedRoute(authorizationRequest);

  expect(authorization).toEqual(
    expect.objectContaining({
      authorized: true,
      preauthorization: expect.objectContaining({ kind: 'background-owned-route' }),
    })
  );
  if (!authorization.authorized) {
    throw new Error('Expected content runtime wake-up authorization to succeed');
  }
  expect(
    getContentRuntimeWakeupSenderBinding(
      getBackgroundOwnedRouteContext(authorization.preauthorization),
      authorizationRequest.message
    )
  ).toEqual({
    documentId: 'content-document-1',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  });
});

it('rejects content runtime wake-up from unauthorized senders', () => {
  expect(authorizeBackgroundOwnedRoute(contentRuntimeWakeupRequest({}, true))).toEqual({
    authorized: false,
    reason: 'Unauthorized content runtime wake-up sender',
  });
});

it('rejects pin activation without a one-shot trusted-content capability', () => {
  expect(authorizeBackgroundOwnedRoute(contentRuntimeWakeupRequest(undefined, true))).toEqual({
    authorized: false,
    reason: 'Unauthorized pin-to-tab permission request',
  });
});

it('authorizes pin activation with a document-bound trusted-content capability', () => {
  const sender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
  const contentIntent = issueContentPrivilegedActionCapability({
    actionType: MessageType.CONTENT_RUNTIME_WAKEUP,
    requestId: 'pin-request-1',
    senderBinding: {
      documentId: 'content-document-1',
      frameId: 0,
      senderUrl: 'https://example.test/page',
      tabId: 7,
    },
  });

  expect(
    authorizeBackgroundOwnedRoute(contentRuntimeWakeupRequest(sender, true, contentIntent))
  ).toEqual(expect.objectContaining({ authorized: true }));
  expect(
    authorizeBackgroundOwnedRoute(contentRuntimeWakeupRequest(sender, true, contentIntent))
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized pin-to-tab permission request',
  });
});
