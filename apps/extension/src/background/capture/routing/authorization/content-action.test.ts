import { expect, it } from 'vitest';

import {
  getPreauthorizedContentActionRouteMessage,
  markPreauthorizedContentActionRouteMessage,
  type ContentSenderBinding,
} from './content-action';

it('tracks content action sender bindings per route message object', () => {
  const message = {};
  const otherMessage = {};
  const senderBinding: ContentSenderBinding = {
    documentId: 'document-1',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  };

  expect(getPreauthorizedContentActionRouteMessage(message)).toBeUndefined();
  markPreauthorizedContentActionRouteMessage(message, senderBinding);

  expect(getPreauthorizedContentActionRouteMessage(message)).toBe(senderBinding);
  expect(getPreauthorizedContentActionRouteMessage(otherMessage)).toBeUndefined();
});
