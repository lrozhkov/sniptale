import { describe, expect, it } from 'vitest';

import { authorizeContentSender } from './sender-binding';

function sender(overrides: Record<string, unknown> = {}): chrome.runtime.MessageSender {
  return {
    documentId: 'document-7',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
    ...overrides,
  } as chrome.runtime.MessageSender;
}

describe('authorizeContentSender', () => {
  it('returns the normalized content principal for the resolved top-level tab', () => {
    expect(authorizeContentSender(sender(), 7)).toEqual({
      allowed: true,
      principal: {
        documentId: 'document-7',
        frameId: 0,
        senderUrl: 'https://example.test/page',
        tabId: 7,
      },
    });
  });

  it.each([
    ['missing sender', undefined, 'missing-tab-id'],
    ['missing tab', sender({ tab: undefined }), 'missing-tab-id'],
    ['wrong tab', sender(), 'resolved-tab-mismatch', 8],
    ['missing frame', sender({ frameId: undefined }), 'missing-frame-id'],
    ['subframe', sender({ frameId: 2 }), 'subframe-sender'],
    ['missing document', sender({ documentId: undefined }), 'missing-document-id'],
    ['empty document', sender({ documentId: '' }), 'missing-document-id'],
    ['missing URL', sender({ url: undefined }), 'invalid-sender-url'],
    ['malformed URL', sender({ url: 'not a url' }), 'invalid-sender-url'],
    [
      'own extension',
      sender({ url: 'chrome-extension://sniptale/apps/extension/src/settings/index.html' }),
      'extension-sender',
    ],
    [
      'foreign extension',
      sender({ url: 'chrome-extension://foreign-extension/page.html' }),
      'extension-sender',
    ],
    [
      'foreign Firefox extension',
      sender({ url: 'moz-extension://foreign-extension/page.html' }),
      'extension-sender',
    ],
  ])('denies %s with a bounded reason', (_label, candidate, reason, resolvedTabId = 7) => {
    expect(authorizeContentSender(candidate, resolvedTabId)).toEqual({ allowed: false, reason });
  });
});
