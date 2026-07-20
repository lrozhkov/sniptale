import { afterEach, expect, it } from 'vitest';

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
