import { afterEach, expect, it, vi } from 'vitest';
import { createRecordingDrawingClockDriver } from './drawing-clock';

afterEach(() => {
  vi.useRealTimers();
});

it('adapts the browser clock and supports cancellation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1234);
  const callback = vi.fn();
  const clock = createRecordingDrawingClockDriver();

  expect(clock.now()).toBe(1234);
  const handle = clock.setTimeout(callback, 50);
  clock.clearTimeout(handle);
  vi.advanceTimersByTime(50);

  expect(callback).not.toHaveBeenCalled();
});
