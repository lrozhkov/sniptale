import { beforeEach, expect, it, vi } from 'vitest';

const captureVisibleTab = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { captureVisibleTab },
}));

import {
  resetNativeVisibleCaptureCoordinatorForTests,
  runNativeVisibleCaptureExclusive,
} from './coordinator';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  vi.clearAllMocks();
  resetNativeVisibleCaptureCoordinatorForTests();
  captureVisibleTab.mockResolvedValue('data:image/png;base64,tile');
});

it('serializes whole transactions and enforces at least 550 ms between native captures', async () => {
  const first = runNativeVisibleCaptureExclusive(async (lease) => {
    await lease.capture(1, { format: 'png' });
    await lease.capture(1, { format: 'png' });
    return 'first';
  });
  const secondWork = vi.fn(async () => 'second');
  const second = runNativeVisibleCaptureExclusive(secondWork);

  await vi.advanceTimersByTimeAsync(550);
  await vi.advanceTimersByTimeAsync(550);

  await expect(first).resolves.toBe('first');
  await expect(second).resolves.toBe('second');
  expect(captureVisibleTab).toHaveBeenCalledTimes(2);
  expect(secondWork).toHaveBeenCalledTimes(1);
});

it('runs the final capture guard after rate limiting and immediately before the browser API', async () => {
  const order: string[] = [];
  captureVisibleTab.mockImplementation(async () => {
    order.push('capture');
    return 'data:image/png;base64,tile';
  });
  const transaction = runNativeVisibleCaptureExclusive(async (lease) => {
    await lease.capture(1, { format: 'png' });
    const guarded = lease.capture(1, { format: 'png' }, async () => {
      order.push('guard');
    });
    await vi.advanceTimersByTimeAsync(549);
    expect(order).toEqual(['capture']);
    await vi.advanceTimersByTimeAsync(1);
    await guarded;
  });

  await transaction;
  expect(order).toEqual(['capture', 'guard', 'capture']);
});

it('rechecks the target and retries once after Chrome reports the exact visible-capture quota', async () => {
  const quotaFailure = new Error(
    'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.'
  );
  captureVisibleTab.mockRejectedValueOnce(quotaFailure).mockResolvedValueOnce('retry-tile');
  const guard = vi.fn().mockResolvedValue(undefined);

  const transaction = runNativeVisibleCaptureExclusive((lease) =>
    lease.capture(1, { format: 'png' }, guard)
  );
  await vi.advanceTimersByTimeAsync(1_100);

  await expect(transaction).resolves.toBe('retry-tile');
  expect(guard).toHaveBeenCalledTimes(2);
  expect(captureVisibleTab).toHaveBeenCalledTimes(2);
});

it('does not retry unrelated visible-capture failures', async () => {
  const failure = new Error('capture denied');
  captureVisibleTab.mockRejectedValueOnce(failure);

  await expect(
    runNativeVisibleCaptureExclusive((lease) => lease.capture(1, { format: 'png' }))
  ).rejects.toBe(failure);
  expect(captureVisibleTab).toHaveBeenCalledOnce();
});
