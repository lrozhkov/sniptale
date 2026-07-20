import { beforeEach, expect, it, vi } from 'vitest';

import { waitForCountdownTimer } from './countdown';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-26T12:00:00.000Z'));
});

it('resolves true when the countdown duration elapses', async () => {
  const resultPromise = waitForCountdownTimer('session-1', 300, () => false);

  await vi.advanceTimersByTimeAsync(300);

  await expect(resultPromise).resolves.toBe(true);
});

it('resolves false when the countdown is cancelled before completion', async () => {
  let cancelled = false;
  const resultPromise = waitForCountdownTimer('session-2', 1_000, () => cancelled);

  await vi.advanceTimersByTimeAsync(100);
  cancelled = true;
  await vi.advanceTimersByTimeAsync(100);

  await expect(resultPromise).resolves.toBe(false);
});
