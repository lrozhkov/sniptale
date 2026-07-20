import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDurationTracker } from './duration';

describe('offscreen-duration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes idle and active elapsed seconds', verifyIdleAndActiveElapsedSeconds);
  it(
    'freezes active time once and ignores repeated freezes after the segment is closed',
    verifyFreezeOnce
  );
  it('stops broadcasting and resets elapsed state', verifyStopAndReset);
});

function verifyIdleAndActiveElapsedSeconds(): void {
  const sendUpdate = vi.fn();
  const tracker = createDurationTracker(sendUpdate);

  tracker.publishDuration();
  tracker.startSegment();
  vi.advanceTimersByTime(1100);

  expect(sendUpdate).toHaveBeenNthCalledWith(1, 0);
  expect(sendUpdate).toHaveBeenNthCalledWith(2, 0);
  expect(sendUpdate).toHaveBeenNthCalledWith(3, 1);
  expect(tracker.getElapsedSeconds()).toBe(1);
}

function verifyFreezeOnce(): void {
  const tracker = createDurationTracker(vi.fn());

  tracker.startSegment();
  vi.advanceTimersByTime(2500);
  tracker.freeze();
  tracker.freeze();
  vi.advanceTimersByTime(5000);

  expect(tracker.getElapsedSeconds()).toBe(2);
}

function verifyStopAndReset(): void {
  const sendUpdate = vi.fn();
  const tracker = createDurationTracker(sendUpdate);

  tracker.stopSegment();
  tracker.startSegment();
  vi.advanceTimersByTime(1200);
  tracker.stopSegment();
  tracker.reset();
  vi.advanceTimersByTime(3000);

  expect(sendUpdate).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(tracker.getElapsedSeconds()).toBe(0);
}
