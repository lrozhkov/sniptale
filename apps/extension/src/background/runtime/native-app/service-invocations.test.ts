import { afterEach, expect, it, vi } from 'vitest';

import { NativeInvocationReplayGuard } from './service-invocations';

afterEach(() => {
  vi.useRealTimers();
});

it('rejects duplicate and stale native invocations', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const warn = vi.fn();
  const guard = new NativeInvocationReplayGuard();
  const message = {
    controllerLeaseId: 'lease-1',
    invocationId: 'invoke-1',
    requestedAtEpochMs: 1_000,
  };

  expect(guard.consume(message, warn)).toBe(true);
  expect(guard.consume(message, warn)).toBe(false);
  expect(
    guard.consume({ ...message, invocationId: 'old', requestedAtEpochMs: -600_000 }, warn)
  ).toBe(false);

  expect(warn).toHaveBeenCalledWith('Replay native invocation');
  expect(warn).toHaveBeenCalledWith('Stale native invocation');
});

it('prunes old entries and clears consumed invocations on reset', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const warn = vi.fn();
  const guard = new NativeInvocationReplayGuard();

  expect(
    guard.consume(
      { controllerLeaseId: 'lease-1', invocationId: 'first', requestedAtEpochMs: 1_000 },
      warn
    )
  ).toBe(true);
  vi.setSystemTime(302_000);
  expect(
    guard.consume(
      { controllerLeaseId: 'lease-1', invocationId: 'first', requestedAtEpochMs: 302_000 },
      warn
    )
  ).toBe(true);
  guard.reset();
  expect(
    guard.consume(
      { controllerLeaseId: 'lease-1', invocationId: 'first', requestedAtEpochMs: 302_000 },
      warn
    )
  ).toBe(true);
});
