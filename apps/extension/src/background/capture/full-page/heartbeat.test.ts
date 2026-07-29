import { afterEach, expect, it, vi } from 'vitest';
import { startFullPageCaptureHeartbeat } from './heartbeat';

const identity = {
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'runtime-1',
};

afterEach(() => {
  vi.useRealTimers();
});

it('renews both page-agent and storage leases during a long raster stage', async () => {
  vi.useFakeTimers();
  const heartbeat = vi.fn().mockResolvedValue(undefined);
  const renewLease = vi.fn().mockResolvedValue(undefined);
  const active = startFullPageCaptureHeartbeat({
    agent: { heartbeat },
    identity,
    renewLease,
  });

  await vi.advanceTimersByTimeAsync(12_000);

  expect(heartbeat).toHaveBeenCalledTimes(3);
  expect(renewLease).toHaveBeenCalledTimes(3);
  expect(active.signal.aborted).toBe(false);
  await active.stop();
});

it('aborts the capture when a heartbeat can no longer reach the bound document', async () => {
  vi.useFakeTimers();
  const failure = new Error('document changed');
  const active = startFullPageCaptureHeartbeat({
    agent: { heartbeat: vi.fn().mockRejectedValue(failure) },
    identity,
    renewLease: vi.fn().mockResolvedValue(undefined),
  });

  await vi.advanceTimersByTimeAsync(4_000);

  expect(active.signal.aborted).toBe(true);
  expect(active.signal.reason).toBe(failure);
  await active.stop();
});

it('bounds a heartbeat that never settles before the page watchdog expires', async () => {
  vi.useFakeTimers();
  const active = startFullPageCaptureHeartbeat({
    agent: { heartbeat: vi.fn(() => new Promise<void>(() => {})) },
    identity,
    renewLease: vi.fn().mockResolvedValue(undefined),
  });

  await vi.advanceTimersByTimeAsync(9_000);

  expect(active.signal.aborted).toBe(true);
  expect(active.signal.reason).toMatchObject({ message: 'Full-page capture heartbeat timed out' });
  await active.stop();
});

it('relays external cancellation and makes repeated stop idempotent', async () => {
  vi.useFakeTimers();
  const external = new AbortController();
  const failure = new Error('export cancelled');
  const active = startFullPageCaptureHeartbeat({
    agent: { heartbeat: vi.fn().mockResolvedValue(undefined) },
    externalSignal: external.signal,
    identity,
    renewLease: vi.fn().mockResolvedValue(undefined),
  });

  external.abort(failure);

  expect(active.signal.aborted).toBe(true);
  expect(active.signal.reason).toBe(failure);
  await active.stop();
  await active.stop();
});

it('starts aborted when the external capture signal has already ended', async () => {
  const external = new AbortController();
  external.abort(new Error('already cancelled'));
  const active = startFullPageCaptureHeartbeat({
    agent: { heartbeat: vi.fn().mockResolvedValue(undefined) },
    externalSignal: external.signal,
    identity,
    renewLease: vi.fn().mockResolvedValue(undefined),
  });

  expect(active.signal.aborted).toBe(true);
  await active.stop();
});
