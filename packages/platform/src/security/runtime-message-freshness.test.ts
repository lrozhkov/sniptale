import { afterEach, expect, it, vi } from 'vitest';

import {
  RUNTIME_MESSAGE_FRESHNESS_FIELD,
  attachRuntimeMessageFreshness,
  createRuntimeMessageFreshness,
  splitRuntimeMessageFreshness,
  stripRuntimeMessageFreshness,
} from './runtime-message-freshness';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('attaches and strips runtime message freshness without mutating the domain message', () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'nonce-1') });
  vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
  vi.useFakeTimers();

  const message = { type: 'GET_RECORDING_STATE' };
  const messageWithFreshness = attachRuntimeMessageFreshness(
    message,
    createRuntimeMessageFreshness()
  );

  expect(message).toEqual({ type: 'GET_RECORDING_STATE' });
  expect(messageWithFreshness[RUNTIME_MESSAGE_FRESHNESS_FIELD]).toEqual({
    issuedAtEpochMs: Date.now(),
    nonce: 'nonce-1',
  });
  expect(stripRuntimeMessageFreshness(messageWithFreshness)).toEqual(message);

  vi.useRealTimers();
});

it('splits only well-formed runtime message freshness envelopes', () => {
  const validMessage = attachRuntimeMessageFreshness(
    { type: 'GET_RECORDING_STATE' },
    { issuedAtEpochMs: 1_000, nonce: 'nonce-1' }
  );

  expect(splitRuntimeMessageFreshness(validMessage)).toEqual({
    freshness: { issuedAtEpochMs: 1_000, nonce: 'nonce-1' },
    message: { type: 'GET_RECORDING_STATE' },
    valid: true,
  });
  expect(splitRuntimeMessageFreshness({ type: 'GET_RECORDING_STATE' })).toEqual({
    message: { type: 'GET_RECORDING_STATE' },
    reason: 'Missing or invalid runtime message freshness',
    valid: false,
  });
});
