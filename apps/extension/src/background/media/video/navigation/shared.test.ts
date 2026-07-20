import { afterEach, expect, it, vi } from 'vitest';
import { resolveViewportPixelBounds, waitForViewportSettle } from './shared';

afterEach(() => {
  vi.useRealTimers();
});

it('rounds viewport bounds to positive integers', () => {
  expect(resolveViewportPixelBounds({ cssWidth: 1364.8, cssHeight: 768.2 })).toEqual({
    width: 1365,
    height: 768,
  });
  expect(resolveViewportPixelBounds({ cssWidth: 0, cssHeight: -1 })).toEqual({
    width: 1,
    height: 1,
  });
});

it('waits for the settle delay before resolving', async () => {
  vi.useFakeTimers();

  const settlePromise = waitForViewportSettle(150);
  await vi.advanceTimersByTimeAsync(150);

  await expect(settlePromise).resolves.toBeUndefined();
});
