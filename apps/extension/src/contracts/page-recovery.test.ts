import { expect, it } from 'vitest';
import {
  PAGE_RECOVERY_MAX_BYTES,
  isPageRecoveryPayload,
  parsePageRecoveryRequest,
  parsePageRecoveryReply,
} from './page-recovery';
const requestId = 'e9e02b06-6761-4c7a-88fe-15385b82b25b';
const lease = 'cf53bdda-bec6-42d9-a9c9-4e478c5f0535';
it('admits only explicit lease-bound recovery commands with no caller-selected native identity', () => {
  expect(parsePageRecoveryRequest({ kind: 'peek', requestId })).toEqual({
    kind: 'peek',
    requestId,
  });
  for (const kind of ['load', 'discard'] as const)
    expect(parsePageRecoveryRequest({ kind, requestId, lease })).toEqual({
      kind,
      requestId,
      lease,
    });
  expect(
    parsePageRecoveryRequest({ kind: 'save', requestId, lease, payload: '{}', changedAt: 1000 })
  ).toBeTruthy();
  for (const value of [
    null,
    {},
    { kind: 'load', requestId },
    { kind: 'save', requestId, lease, payload: '' },
    { kind: 'peek', requestId, tabId: 10 },
    { kind: 'peek', requestId, nonce: lease },
    { kind: 'peek', requestId, pageUrl: 'https://foreign.test' },
  ])
    expect(parsePageRecoveryRequest(value)).toBeNull();
});
it('bounds actual UTF-8 bytes and refuses malformed responses', () => {
  expect(isPageRecoveryPayload('x'.repeat(PAGE_RECOVERY_MAX_BYTES))).toBe(true);
  expect(isPageRecoveryPayload('x'.repeat(PAGE_RECOVERY_MAX_BYTES + 1))).toBe(false);
  expect(isPageRecoveryPayload('я'.repeat(PAGE_RECOVERY_MAX_BYTES / 2 + 1))).toBe(false);
  const result = {
    kind: 'result',
    requestId,
    status: 'ready',
    lease,
    available: true,
    payload: '{}',
  };
  expect(parsePageRecoveryReply(result)).toEqual(result);
  expect(parsePageRecoveryReply({ ...result, nonce: lease })).toBeNull();
  expect(parsePageRecoveryReply({ ...result, status: 'unknown' })).toBeNull();
});
