import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  getBackgroundOwnedRouteContext,
  getHighlighterSettingsMutationSenderBinding,
} from '../../../routing-contracts/owned-route-context';
import { authorizeBackgroundOwnedRoute } from './background-owned';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function mutationRequest(
  sender: chrome.runtime.MessageSender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  }
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: {
      operation: 'set-default-border-preset',
      presetId: 'system-marker',
      type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
    },
    sender,
  };
}

it('authorizes only a top-frame content runtime and binds the target preset', () => {
  const request = mutationRequest();
  const authorization = authorizeBackgroundOwnedRoute(request);

  expect(authorization).toEqual(
    expect.objectContaining({
      authorized: true,
      preauthorization: expect.objectContaining({ kind: 'background-owned-route' }),
    })
  );
  if (!authorization.authorized) throw new Error('Expected authorization to succeed');
  const routeContext = getBackgroundOwnedRouteContext(authorization.preauthorization);
  expect(getHighlighterSettingsMutationSenderBinding(routeContext, request.message)).toMatchObject({
    documentId: 'content-document-1',
    frameId: 0,
    tabId: 7,
  });
  expect(
    getHighlighterSettingsMutationSenderBinding(routeContext, {
      ...request.message,
      presetId: 'system-attention',
    })
  ).toBeNull();
});

it.each([
  ['missing sender identity', {}],
  [
    'extension page',
    {
      documentId: 'extension-document-1',
      frameId: 0,
      tab: { id: 7 } as chrome.tabs.Tab,
      url: 'chrome-extension://test/apps/extension/src/settings/index.html',
    },
  ],
  [
    'subframe',
    {
      documentId: 'content-document-1',
      frameId: 3,
      tab: { id: 7 } as chrome.tabs.Tab,
      url: 'https://example.test/frame',
    },
  ],
] as const)('rejects %s for highlighter settings mutation', (_label, sender) => {
  expect(authorizeBackgroundOwnedRoute(mutationRequest(sender))).toEqual({
    authorized: false,
    reason: 'Unauthorized highlighter settings mutation sender',
  });
});
