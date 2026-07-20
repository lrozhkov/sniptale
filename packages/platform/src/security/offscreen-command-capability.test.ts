import { expect, it } from 'vitest';
import {
  attachOffscreenCommandCapability,
  authorizeOffscreenCommandCapability,
  createOffscreenCommandBinding,
} from './offscreen-command-capability';

const BASE_TIME = 1_700_000_000_000;

function createCommand() {
  return {
    type: 'OFFSCREEN_STOP_RECORDING',
    discard: true,
  };
}

it('authorizes a freshly issued offscreen command capability', () => {
  const message = attachOffscreenCommandCapability(createCommand(), BASE_TIME);

  expect(authorizeOffscreenCommandCapability(message, BASE_TIME)).toEqual({
    authorized: true,
    generation: expect.any(String),
  });
});

it('rejects tampered command payloads with an existing capability token', () => {
  const message = attachOffscreenCommandCapability(createCommand(), BASE_TIME);

  expect(authorizeOffscreenCommandCapability({ ...message, discard: false }, BASE_TIME)).toEqual({
    authorized: false,
    reason: 'Offscreen command capability binding mismatch',
  });
});

it('rejects stale offscreen command capabilities', () => {
  const message = attachOffscreenCommandCapability(createCommand(), BASE_TIME);

  expect(authorizeOffscreenCommandCapability(message, BASE_TIME + 121_000)).toEqual({
    authorized: false,
    reason: 'Invalid offscreen command capability',
  });
});

it('builds the same binding when transport freshness and capability token differ', () => {
  const command = createCommand();

  expect(
    createOffscreenCommandBinding({
      ...command,
      capabilityToken: 'token-a',
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: BASE_TIME, nonce: 'nonce-a' },
    })
  ).toBe(
    createOffscreenCommandBinding({
      ...command,
      capabilityToken: 'token-b',
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: BASE_TIME + 1, nonce: 'nonce-b' },
    })
  );
});
