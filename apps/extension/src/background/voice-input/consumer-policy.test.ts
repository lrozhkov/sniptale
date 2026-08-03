import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

import { authorizeVoiceInputPortSender } from './consumer-policy';

function createTab(id: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };
}

describe('voice input consumer policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds the Settings document by exact path and documentId', () => {
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'settings-document',
        tab: createTab(2),
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html?section=voice-input',
      })
    ).toEqual({
      consumerId: 'settings-test',
      documentId: 'settings-document',
      maxDurationMs: 30_000,
    });
  });

  it('binds a top-level web content document for page-tool voice input', () => {
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'content-document',
        frameId: 0,
        tab: createTab(7),
        url: 'https://example.com/review',
      })
    ).toEqual({
      consumerId: 'content-page-tools',
      documentId: 'content-document',
      maxDurationMs: null,
    });
  });

  it('rejects a missing documentId and a lookalike extension path', () => {
    expect(
      authorizeVoiceInputPortSender({
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html',
      })
    ).toBeNull();
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'lookalike-document',
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html.evil',
      })
    ).toBeNull();
  });

  it('rejects nested, non-web, and tabless content senders', () => {
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'nested-document',
        frameId: 2,
        tab: createTab(2),
        url: 'https://example.com/frame',
      })
    ).toBeNull();
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'extension-document',
        frameId: 0,
        tab: createTab(2),
        url: 'chrome-extension://extension-id/apps/extension/src/popup/index.html',
      })
    ).toBeNull();
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'tabless-document',
        frameId: 0,
        url: 'https://example.com/review',
      })
    ).toBeNull();
  });
});
