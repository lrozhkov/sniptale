import { describe, expect, it } from 'vitest';

import { getUnauthorizedOffscreenCommandSenderReason } from './sender-policy';

const UNAUTHORIZED = 'Unauthorized offscreen command sender';

function sender(overrides: Record<string, unknown>): chrome.runtime.MessageSender {
  return { id: 'sniptale-extension', ...overrides } as chrome.runtime.MessageSender;
}

function expectRejectedSender(overrides: Record<string, unknown>): void {
  expect(getUnauthorizedOffscreenCommandSenderReason(sender(overrides))).toBe(UNAUTHORIZED);
}

function expectRejectedMalformedSender(senderValue: chrome.runtime.MessageSender | undefined) {
  expect(getUnauthorizedOffscreenCommandSenderReason(senderValue)).toBe(UNAUTHORIZED);
}

describe('offscreen sender policy', () => {
  it('accepts trusted background sender shapes with extension metadata', () => {
    expect(
      getUnauthorizedOffscreenCommandSenderReason(
        sender({ url: 'chrome-extension://sniptale-extension/service-worker-loader.js' })
      )
    ).toBeNull();
    expect(
      getUnauthorizedOffscreenCommandSenderReason(
        sender({
          url: 'chrome-extension://sniptale-extension/apps/extension/src/background/index.ts',
        })
      )
    ).toBeNull();
    expect(
      getUnauthorizedOffscreenCommandSenderReason(
        sender({
          documentId: 'background-document',
          frameId: 0,
          origin: 'chrome-extension://sniptale-extension',
          url: 'chrome-extension://sniptale-extension/_generated_background_page.html',
        })
      )
    ).toBeNull();
  });

  it('rejects missing, content-tab, extension-page, and malformed sender shapes', () => {
    expectRejectedMalformedSender(undefined);
    expectRejectedMalformedSender({} as chrome.runtime.MessageSender);
    expectRejectedSender({});
    expectRejectedSender({ tab: { id: 7 } });
    expectRejectedSender({
      url: 'chrome-extension://sniptale-extension/apps/extension/src/settings/index.html',
    });
    expectRejectedSender({
      url: 'chrome-extension://sniptale-extension/src/new-extension-page/index.html',
    });
    expectRejectedSender({ url: 'chrome-extension://sniptale-extension/unknown.html' });
    expectRejectedSender({ url: 'not a url' });
    expectRejectedSender({ origin: 'chrome-extension://another-extension' });
    expectRejectedSender({
      origin: 'chrome-extension://another-extension',
      url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
    });
    expectRejectedSender({ url: 'chrome-extension://another-extension/service-worker-loader.js' });
  });
});
