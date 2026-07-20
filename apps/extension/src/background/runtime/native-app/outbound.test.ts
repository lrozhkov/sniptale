import { expect, it } from 'vitest';

import { createNativeControllerAcquireMessage } from './outbound';

it('includes controller identity and omits background document id by default', () => {
  expect(
    createNativeControllerAcquireMessage({
      identity: {
        browserFamily: 'chrome',
        connectionId: 'conn-1',
        extensionId: 'extension-id',
        profileKey: 'profile:stable',
      },
      reason: 'initial-connect',
    })
  ).toEqual(
    expect.objectContaining({
      browserFamily: 'chrome',
      connectionId: 'conn-1',
      extensionId: 'extension-id',
      profileKey: 'profile:stable',
      reason: 'initial-connect',
      type: 'extension.controller.acquire',
    })
  );
});

it('includes document id when a non-background controller identity provides one', () => {
  expect(
    createNativeControllerAcquireMessage({
      identity: {
        browserFamily: 'edge',
        connectionId: 'conn-1',
        documentId: 'doc-1',
        extensionId: 'extension-id',
        profileKey: 'profile:stable',
      },
      reason: 'user-requested-takeover',
    })
  ).toEqual(expect.objectContaining({ documentId: 'doc-1' }));
});
