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
    ).toEqual({ consumerId: 'settings-test', documentId: 'settings-document' });
  });

  it('rejects a missing documentId, content tab, and lookalike path', () => {
    expect(
      authorizeVoiceInputPortSender({
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html',
      })
    ).toBeNull();
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'content-document',
        tab: createTab(2),
        url: 'https://example.com/apps/extension/src/settings/index.html',
      })
    ).toBeNull();
    expect(
      authorizeVoiceInputPortSender({
        documentId: 'lookalike-document',
        url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html.evil',
      })
    ).toBeNull();
  });
});
