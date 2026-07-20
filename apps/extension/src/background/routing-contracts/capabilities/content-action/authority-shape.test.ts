import { expect, it } from 'vitest';

import {
  createContentActionCapabilityPayload,
  createContentCapabilityToken,
  createContentPolicySenderBinding,
} from './authority-shape';

it('builds content capability authority values without changing the sender principal', () => {
  const senderBinding = {
    documentId: 'document-7',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  };

  expect(createContentPolicySenderBinding(senderBinding)).toEqual({
    ...senderBinding,
    origin: 'https://example.test',
  });
  expect(
    createContentActionCapabilityPayload({
      actionType: 'SAVE_SCREENSHOT_TO_GALLERY',
      requestId: 'request-1',
    })
  ).toEqual({ actionType: 'SAVE_SCREENSHOT_TO_GALLERY', requestId: 'request-1' });
  expect(createContentCapabilityToken()).toEqual(expect.any(String));
});
