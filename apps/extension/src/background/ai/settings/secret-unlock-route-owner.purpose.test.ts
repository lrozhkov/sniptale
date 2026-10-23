import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import type { LlmSessionPurpose } from '../../../contracts/messaging/llm';
import { resolveLlmSessionSenderKey } from '../llm/session-tokens';
import { isUnlockRequestOwner } from './secret-unlock-route-owner';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPageSender(page: 'gallery' | 'video-editor'): chrome.runtime.MessageSender {
  return {
    documentId: `${page}-document`,
    frameId: 0,
    id: 'extension-id',
    tab: { id: 7 } as chrome.tabs.Tab,
    url: `chrome-extension://extension-id/apps/extension/src/${page}/index.html`,
  };
}

function createRecord(
  purpose: LlmSessionPurpose,
  sender: chrome.runtime.MessageSender
): StoredAISecretUnlockRequest {
  const senderKey = resolveLlmSessionSenderKey(purpose, sender);
  if (!senderKey) throw new Error('Expected an admitted sender');
  return {
    createdAt: 1,
    expiresAt: 2,
    operation: 'ai-secret-unlock',
    purpose,
    requestId: 'request-1',
    senderKey,
    status: 'pending',
  };
}

it.each(['gallery', 'video-editor'] as const)(
  'recognizes the pending review-text unlock owner from %s',
  (page) => {
    const sender = createPageSender(page);
    expect(isUnlockRequestOwner(createRecord('review-text', sender), sender)).toBe(true);
  }
);

it.each(['gallery', 'video-editor'] as const)(
  'refuses a different document, frame, extension, or page for %s review-text',
  (page) => {
    const sender = createPageSender(page);
    const record = createRecord('review-text', sender);
    const otherPage = page === 'gallery' ? 'video-editor' : 'gallery';
    const { documentId, ...withoutDocument } = sender;
    const { frameId, ...withoutFrame } = sender;
    const { id, ...withoutExtension } = sender;
    const { url, ...withoutUrl } = sender;
    const otherPageUrl = createPageSender(otherPage).url;
    if (!documentId || frameId !== 0 || !id || !url || !otherPageUrl)
      throw new Error('Expected complete owned-page sender fixtures');
    const refused: chrome.runtime.MessageSender[] = [
      { ...sender, documentId: 'other-document' },
      withoutDocument,
      { ...sender, frameId: 1 },
      withoutFrame,
      { ...sender, id: 'other-extension' },
      withoutExtension,
      { ...sender, url: 'https://example.test/apps/extension/src/gallery/index.html' },
      { ...sender, url: url.replace('extension-id', 'other-extension') },
      { ...sender, url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html' },
      { ...sender, url: otherPageUrl },
      withoutUrl,
    ];
    for (const candidate of refused) expect(isUnlockRequestOwner(record, candidate)).toBe(false);
  }
);

it.each(['gallery', 'video-editor'] as const)(
  'does not reuse a review-text sender key for another purpose from %s',
  (page) => {
    const sender = createPageSender(page);
    const record = createRecord('review-text', sender);
    expect(isUnlockRequestOwner({ ...record, purpose: 'content-ai-pick' }, sender)).toBe(false);
    expect(isUnlockRequestOwner({ ...record, purpose: 'scenario-editor' }, sender)).toBe(false);
    expect(
      isUnlockRequestOwner(
        { ...createRecord('content-ai-pick', sender), purpose: 'review-text' },
        sender
      )
    ).toBe(false);
  }
);

it('retains content ownership bound to tab, frame, and document for its recorded purpose', () => {
  const sender: chrome.runtime.MessageSender = {
    documentId: 'content-document',
    frameId: 2,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
  const record = createRecord('content-ai-pick', sender);
  expect(isUnlockRequestOwner(record, sender)).toBe(true);
  expect(isUnlockRequestOwner(record, { ...sender, tab: { id: 8 } as chrome.tabs.Tab })).toBe(
    false
  );
  expect(isUnlockRequestOwner(record, { ...sender, frameId: 3 })).toBe(false);
  expect(isUnlockRequestOwner(record, { ...sender, documentId: 'other-document' })).toBe(false);
  expect(isUnlockRequestOwner({ ...record, purpose: 'scenario-editor' }, sender)).toBe(false);
});

it('retains scenario ownership for its recorded purpose even when the sender has a tab', () => {
  const sender: chrome.runtime.MessageSender = {
    documentId: 'scenario-document',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'chrome-extension://extension-id/apps/extension/src/scenario-editor/index.html',
  };
  const record = createRecord('scenario-editor', sender);
  expect(isUnlockRequestOwner(record, sender)).toBe(true);
  expect(isUnlockRequestOwner(record, { ...sender, documentId: 'other-document' })).toBe(false);
  expect(isUnlockRequestOwner({ ...record, purpose: 'content-ai-pick' }, sender)).toBe(false);
});
