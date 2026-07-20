import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  getBackgroundOwnedRouteContext,
  getContentRuntimeWakeupSenderBinding,
} from '../../../routing-contracts/owned-route-context';
import { authorizeBackgroundOwnedRoute } from './background-owned';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';

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
  }
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: { type: MessageType.CONTENT_RUNTIME_WAKEUP },
    sender,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  expect(authorizeBackgroundOwnedRoute(contentRuntimeWakeupRequest({}))).toEqual({
    authorized: false,
    reason: 'Unauthorized content runtime wake-up sender',
  });
});
