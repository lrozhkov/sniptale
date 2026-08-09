import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

import { authorizeBackgroundOwnedRoute } from './background-owned';

it('authorizes only the exact gallery document for aggregate promotion', () => {
  const request = (url: string) => ({
    kind: 'background-owned' as const,
    message: { type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY },
    sender: { url },
  });

  expect(
    authorizeBackgroundOwnedRoute(
      request('chrome-extension://test/apps/extension/src/gallery/index.html?scope=drafts')
    )
  ).toEqual({ authorized: true });
  expect(
    authorizeBackgroundOwnedRoute(
      request('chrome-extension://test/apps/extension/src/editor/index.html')
    )
  ).toEqual({ authorized: false, reason: 'Unauthorized aggregate promotion sender' });
  expect(
    authorizeBackgroundOwnedRoute(
      request('chrome-extension://neighbor/apps/extension/src/gallery/index.html')
    )
  ).toEqual({ authorized: false, reason: 'Unauthorized aggregate promotion sender' });
});
