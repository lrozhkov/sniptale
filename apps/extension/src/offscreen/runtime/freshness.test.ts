import { expect, it } from 'vitest';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { authorizeOffscreenRuntimeMessageFreshness } from './freshness';

const backgroundSender = {
  documentId: 'background-document',
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;

it('authorizes fresh offscreen runtime messages and strips transport metadata', () => {
  const result = authorizeOffscreenRuntimeMessageFreshness({
    message: attachRuntimeMessageFreshness(
      { type: 'OFFSCREEN_STOP_RECORDING' },
      { issuedAtEpochMs: 1_700_000_000_000, nonce: 'freshness-test-valid' }
    ),
    nowEpochMs: 1_700_000_000_001,
    sender: backgroundSender,
  });

  expect(result).toEqual({
    authorized: true,
    message: { type: 'OFFSCREEN_STOP_RECORDING' },
  });
});

it('rejects stale offscreen runtime message freshness', () => {
  const result = authorizeOffscreenRuntimeMessageFreshness({
    message: attachRuntimeMessageFreshness(
      { type: 'OFFSCREEN_STOP_RECORDING' },
      { issuedAtEpochMs: 1_700_000_000_000, nonce: 'freshness-test-stale' }
    ),
    nowEpochMs: 1_700_000_200_001,
    sender: backgroundSender,
  });

  expect(result).toEqual({
    authorized: false,
    reason: 'Stale runtime message freshness',
  });
});
