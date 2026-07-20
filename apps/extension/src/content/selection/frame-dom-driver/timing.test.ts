import { describe, expect, it, vi } from 'vitest';
import { scheduleFrameClearCompletion } from './timing';

describe('frame-dom-driver timing', () => {
  it('keeps only the latest clear-completion timer active for the same clearing ref', () => {
    vi.useFakeTimers();
    const isClearingRef = { current: true };

    scheduleFrameClearCompletion(isClearingRef, 100);
    vi.advanceTimersByTime(50);
    scheduleFrameClearCompletion(isClearingRef, 100);
    vi.advanceTimersByTime(50);

    expect(isClearingRef.current).toBe(true);

    vi.advanceTimersByTime(50);

    expect(isClearingRef.current).toBe(false);
  });
});
