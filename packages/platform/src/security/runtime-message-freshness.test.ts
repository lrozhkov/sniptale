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

it('creates freshness on HTTP when only secure random values are available', () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  const first = createRuntimeMessageFreshness(123);
  const second = createRuntimeMessageFreshness(123);
  expect(first.issuedAtEpochMs).toBe(123);
  expect(first.nonce).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
  );
  expect(second.nonce).not.toBe(first.nonce);
});

it('fails closed without any secure randomness', () => {
  vi.stubGlobal('crypto', {});
  expect(() => createRuntimeMessageFreshness()).toThrow(
    'Runtime message nonce generation is unavailable.'
  );
});
