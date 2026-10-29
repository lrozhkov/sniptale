import { afterEach, expect, it, vi } from 'vitest';

import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import {
  authorizeRuntimeMessageFreshness,
  resetRuntimeMessageFreshnessForTests,
} from './freshness';

const MESSAGE = { type: 'GET_RECORDING_STATE' };

function sender(tabId: number): chrome.runtime.MessageSender {
  return {
    documentId: `doc-${tabId}`,
    frameId: 0,
    tab: { id: tabId } as chrome.tabs.Tab,
    url: `https://example.test/tab-${tabId}`,
  };
}

function messageWithFreshness(nonce: string, issuedAtEpochMs = 1_000): Record<string, unknown> {
  return attachRuntimeMessageFreshness(MESSAGE, { issuedAtEpochMs, nonce });
}

afterEach(() => {
  resetRuntimeMessageFreshnessForTests();
});

it('authorizes a fresh runtime nonce once per sender scope', () => {
  const message = messageWithFreshness('nonce-1');

  expect(
    authorizeRuntimeMessageFreshness({ message, nowEpochMs: 1_500, sender: sender(7) })
  ).toEqual({ authorized: true, message: MESSAGE });
  expect(
    authorizeRuntimeMessageFreshness({ message, nowEpochMs: 1_600, sender: sender(7) })
  ).toEqual({ authorized: false, reason: 'Runtime message replay detected' });
  expect(
    authorizeRuntimeMessageFreshness({ message, nowEpochMs: 1_600, sender: sender(8) })
  ).toEqual({ authorized: true, message: MESSAGE });
});

it('rejects missing and stale runtime freshness before routing', () => {
  expect(
    authorizeRuntimeMessageFreshness({ message: MESSAGE, nowEpochMs: 1_000, sender: sender(7) })
  ).toEqual({
    authorized: false,
    reason: 'Missing or invalid runtime message freshness',
  });
  expect(
    authorizeRuntimeMessageFreshness({
      message: messageWithFreshness('nonce-2', 1_000),
      nowEpochMs: 1_000 + 2 * 60 * 1_000,
      sender: sender(7),
    })
  ).toEqual({ authorized: false, reason: 'Stale runtime message freshness' });
});

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));

it('isolates Gallery preview pressure from foreground and keeps ordinary sender limits', () => {
  const gallery = {
    ...sender(1),
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html',
  };
  const authorize = (
    nonce: string,
    command: object,
    from: chrome.runtime.MessageSender = gallery
  ) =>
    authorizeRuntimeMessageFreshness({
      message: attachRuntimeMessageFreshness(
        { type: 'SYNC_PRODUCT_COMMAND', command },
        { nonce, issuedAtEpochMs: 1000 }
      ),
      sender: from,
      nowEpochMs: 1000,
    });
  for (let index = 0; index < 300; index += 1)
    expect(authorize(`preview-${index}`, { kind: 'thumbnail-read' }).authorized).toBe(true);
  expect(authorize('foreground', { kind: 'replica-prepare' }).authorized).toBe(true);
  expect(authorize('preview-0', { kind: 'replica-prepare' })).toMatchObject({
    authorized: false,
    reason: 'Runtime message replay detected',
  });
  expect(
    authorizeRuntimeMessageFreshness({
      message: messageWithFreshness('local-edit'),
      sender: gallery,
      nowEpochMs: 1000,
    }).authorized
  ).toBe(true);
  const untrusted = sender(2);
  for (let index = 0; index < 256; index += 1)
    expect(authorize(`content-${index}`, { kind: 'thumbnail-read' }, untrusted).authorized).toBe(
      true
    );
  expect(authorize('content-overflow', { kind: 'thumbnail-read' }, untrusted)).toMatchObject({
    authorized: false,
    reason: 'Runtime message freshness cache exhausted',
  });
});

it('reserves foreground permission queries after thumbnail authorization turnover', () => {
  const offscreen = {
    id: 'test',
    documentId: 'offscreen',
    url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup',
  };
  const send = (nonce: string, advisory?: true, from = offscreen) =>
    authorizeRuntimeMessageFreshness({
      message: attachRuntimeMessageFreshness(
        { type: 'SYNC_CONNECTION_ORIGIN_PERMISSION', ...(advisory ? { advisory } : {}) },
        { issuedAtEpochMs: 1000, nonce }
      ),
      sender: from,
      nowEpochMs: 1000,
    });
  for (let index = 0; index < 3840; index += 1)
    expect(send(`permission-${index}`, true).authorized).toBe(true);
  expect(send('preview-overflow', true)).toMatchObject({
    authorized: false,
    reason: 'Runtime message freshness cache exhausted',
  });
  expect(send('foreground-permission').authorized).toBe(true);
  expect(send('permission-0')).toMatchObject({
    authorized: false,
    reason: 'Runtime message replay detected',
  });
  expect(
    send('content-spoof', true, { ...offscreen, url: 'https://example.test/' }).authorized
  ).toBe(true);
});
