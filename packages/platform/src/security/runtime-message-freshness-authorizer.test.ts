import { expect, it } from 'vitest';

import { attachRuntimeMessageFreshness } from './runtime-message-freshness';
import {
  createRuntimeMessageFreshnessAuthorizer,
  type RuntimeMessageFreshnessConsumeHandle,
} from './runtime-message-freshness-authorizer';

const MESSAGE = { type: 'GET_RECORDING_STATE' };

function messageWithFreshness(nonce: string, issuedAtEpochMs = 1_000): Record<string, unknown> {
  return attachRuntimeMessageFreshness(MESSAGE, { issuedAtEpochMs, nonce });
}

function expectAuthorizedInspection(
  value: ReturnType<ReturnType<typeof createRuntimeMessageFreshnessAuthorizer>['inspect']>
): RuntimeMessageFreshnessConsumeHandle {
  expect(value).toEqual(expect.objectContaining({ authorized: true, message: MESSAGE }));
  if (!value.authorized) {
    throw new Error('Expected authorized freshness inspection.');
  }
  return value.consumeHandle;
}

function expectAuthorizesNonce(
  authorizer: ReturnType<typeof createRuntimeMessageFreshnessAuthorizer>,
  args: { issuedAtEpochMs?: number; nonce: string; nowEpochMs: number; scope: string }
): void {
  expect(
    authorizer.authorize({
      message: messageWithFreshness(args.nonce, args.issuedAtEpochMs),
      nowEpochMs: args.nowEpochMs,
      scope: args.scope,
    })
  ).toEqual({ authorized: true, message: MESSAGE });
}

it('separates freshness inspection from nonce consumption', () => {
  const authorizer = createRuntimeMessageFreshnessAuthorizer();
  const message = messageWithFreshness('nonce-1');

  const firstInspection = authorizer.inspect({
    message,
    nowEpochMs: 1_500,
    scope: 'scope-1',
  });
  const secondInspection = authorizer.inspect({
    message,
    nowEpochMs: 1_500,
    scope: 'scope-1',
  });

  const firstHandle = expectAuthorizedInspection(firstInspection);
  const secondHandle = expectAuthorizedInspection(secondInspection);
  expect(
    authorizer.consume({
      handle: firstHandle,
      nowEpochMs: 1_500,
    })
  ).toEqual({ authorized: true });
  expect(
    authorizer.consume({
      handle: secondHandle,
      nowEpochMs: 1_500,
    })
  ).toEqual({ authorized: false, reason: 'Runtime message replay detected' });
});

it('rejects delayed consumption after the inspected freshness expires', () => {
  const authorizer = createRuntimeMessageFreshnessAuthorizer({ ttlMs: 1_000 });
  const inspection = authorizer.inspect({
    message: messageWithFreshness('nonce-2', 1_000),
    nowEpochMs: 1_500,
    scope: 'scope-1',
  });
  const handle = expectAuthorizedInspection(inspection);

  expect(authorizer.consume({ handle, nowEpochMs: 2_000 })).toEqual({
    authorized: false,
    reason: 'Stale runtime message freshness',
  });
});

it('bounds accepted runtime nonces fail-closed without permitting live replay', () => {
  const authorizer = createRuntimeMessageFreshnessAuthorizer({
    maxAcceptedNonces: 3,
    maxAcceptedNoncesPerScope: 2,
    ttlMs: 10_000,
  });

  expectAuthorizesNonce(authorizer, { nonce: 'a', nowEpochMs: 1_000, scope: 's1' });
  expectAuthorizesNonce(authorizer, { nonce: 'b', nowEpochMs: 1_001, scope: 's1' });
  expect(
    authorizer.authorize({ message: messageWithFreshness('c'), nowEpochMs: 1_002, scope: 's1' })
  ).toEqual({ authorized: false, reason: 'Runtime message freshness cache exhausted' });
  expect(
    authorizer.authorize({ message: messageWithFreshness('a'), nowEpochMs: 1_003, scope: 's1' })
  ).toEqual({ authorized: false, reason: 'Runtime message replay detected' });

  expectAuthorizesNonce(authorizer, { nonce: 'd', nowEpochMs: 1_004, scope: 's2' });
  expect(
    authorizer.authorize({ message: messageWithFreshness('e'), nowEpochMs: 1_005, scope: 's2' })
  ).toEqual({ authorized: false, reason: 'Runtime message freshness cache exhausted' });

  expectAuthorizesNonce(authorizer, {
    issuedAtEpochMs: 11_001,
    nonce: 'e',
    nowEpochMs: 11_001,
    scope: 's2',
  });
});
