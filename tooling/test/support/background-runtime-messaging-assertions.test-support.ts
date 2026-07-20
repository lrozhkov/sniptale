import { expect } from 'vitest';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';

export function expectListenerResult<TSendResponse>(
  expected: boolean,
  listener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: TSendResponse
  ) => boolean,
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: TSendResponse
): void {
  const messageWithFreshness =
    typeof message === 'object' && message !== null && !Array.isArray(message)
      ? attachRuntimeMessageFreshness(message as Record<string, unknown>)
      : message;
  expect(listener(messageWithFreshness, sender, sendResponse)).toBe(expected);
}
