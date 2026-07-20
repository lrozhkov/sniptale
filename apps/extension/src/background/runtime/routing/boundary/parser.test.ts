import { afterEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { parseRuntimeMessage } from './parser';
import { resetRuntimeMessageFreshnessForTests } from './freshness';

const logger = { warn: vi.fn() };

function sender(): chrome.runtime.MessageSender {
  return {
    documentId: 'doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
}

afterEach(() => {
  logger.warn.mockReset();
  resetRuntimeMessageFreshnessForTests();
});

it('strips runtime freshness before contract parsing', () => {
  const sendResponse = vi.fn();
  const message = attachRuntimeMessageFreshness(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    { issuedAtEpochMs: Date.now(), nonce: 'nonce-1' }
  );

  expect(
    parseRuntimeMessage({
      logger,
      message,
      sender: sender(),
      sendResponse,
    })
  ).toEqual({ type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' });
  expect(sendResponse).not.toHaveBeenCalled();
});

it('rejects missing and replayed runtime freshness at the background boundary', () => {
  const sendResponse = vi.fn();
  const message = attachRuntimeMessageFreshness(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    { issuedAtEpochMs: Date.now(), nonce: 'nonce-2' }
  );

  expect(
    parseRuntimeMessage({
      logger,
      message: { offscreenStartupId: message.offscreenStartupId, type: message.type },
      sender: sender(),
      sendResponse,
    })
  ).toBeNull();
  expect(parseRuntimeMessage({ logger, message, sender: sender(), sendResponse })).toEqual({
    type: VideoMessageType.OFFSCREEN_READY,
    offscreenStartupId: 'startup-1',
  });
  expect(parseRuntimeMessage({ logger, message, sender: sender(), sendResponse })).toBeNull();
  const serializedLogs = JSON.stringify(logger.warn.mock.calls);
  expect(serializedLogs).not.toContain('https://example.test/page');
  expect(serializedLogs).not.toContain('nonce-2');
  expect(serializedLogs).not.toContain('startup-1');
});

it('does not consume runtime freshness when contract parsing fails', () => {
  const sendResponse = vi.fn();
  const freshness = { issuedAtEpochMs: Date.now(), nonce: 'nonce-3' };
  const malformedMessage = attachRuntimeMessageFreshness(
    { type: 'UNKNOWN_RUNTIME_MESSAGE' },
    freshness
  );
  const validMessage = attachRuntimeMessageFreshness(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    freshness
  );

  expect(
    parseRuntimeMessage({ logger, message: malformedMessage, sender: sender(), sendResponse })
  ).toBeNull();
  expect(
    parseRuntimeMessage({ logger, message: validMessage, sender: sender(), sendResponse })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_READY,
    offscreenStartupId: 'startup-1',
  });
  expect(logger.warn).toHaveBeenCalledWith('Rejected runtime message without a valid contract');
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('UNKNOWN_RUNTIME_MESSAGE');
});
