import { expect, it } from 'vitest';

import {
  RUNTIME_MESSAGE_FRESHNESS_FIELD,
  splitRuntimeMessageFreshness,
  stripRuntimeMessageFreshness,
} from './runtime-message-freshness';

it('splits valid runtime freshness envelopes without mutating the input', () => {
  const input = {
    [RUNTIME_MESSAGE_FRESHNESS_FIELD]: { issuedAtEpochMs: 1_000, nonce: 'nonce-1' },
    type: 'GET_RECORDING_STATE',
  };

  expect(splitRuntimeMessageFreshness(input)).toEqual({
    freshness: { issuedAtEpochMs: 1_000, nonce: 'nonce-1' },
    message: { type: 'GET_RECORDING_STATE' },
    valid: true,
  });
  expect(input).toHaveProperty(RUNTIME_MESSAGE_FRESHNESS_FIELD);
});

it('rejects malformed runtime freshness envelopes with stable reasons', () => {
  expect(splitRuntimeMessageFreshness(null)).toEqual({
    message: null,
    reason: 'Runtime message payload must be an object',
    valid: false,
  });
  expect(
    splitRuntimeMessageFreshness({
      [RUNTIME_MESSAGE_FRESHNESS_FIELD]: { issuedAtEpochMs: Number.NaN, nonce: 'nonce-1' },
      type: 'GET_RECORDING_STATE',
    })
  ).toEqual({
    message: expect.any(Object),
    reason: 'Missing or invalid runtime message freshness',
    valid: false,
  });
  expect(
    splitRuntimeMessageFreshness({
      [RUNTIME_MESSAGE_FRESHNESS_FIELD]: { issuedAtEpochMs: 1_000, nonce: '' },
      type: 'GET_RECORDING_STATE',
    })
  ).toEqual({
    message: expect.any(Object),
    reason: 'Missing or invalid runtime message freshness',
    valid: false,
  });
});

it('strips runtime freshness only from object envelopes that carry it', () => {
  const message = { type: 'GET_RECORDING_STATE' };
  const input = {
    [RUNTIME_MESSAGE_FRESHNESS_FIELD]: { issuedAtEpochMs: 1_000, nonce: 'nonce-1' },
    ...message,
  };

  expect(stripRuntimeMessageFreshness(input)).toEqual(message);
  expect(stripRuntimeMessageFreshness(message)).toBe(message);
  expect(stripRuntimeMessageFreshness(null)).toBeNull();
});
