// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { startContentSizeTooltipStepperRepeat } from './repeat';

afterEach(() => {
  vi.useRealTimers();
});

describe('content size tooltip stepper repeat', () => {
  it('does not start repeating after cleanup before the initial delay', () => {
    vi.useFakeTimers();
    const action = vi.fn();

    const stopRepeating = startContentSizeTooltipStepperRepeat(action);
    stopRepeating();
    vi.advanceTimersByTime(500);

    expect(action).not.toHaveBeenCalled();
  });

  it('stops an active repeat interval after cleanup', () => {
    vi.useFakeTimers();
    const action = vi.fn();

    const stopRepeating = startContentSizeTooltipStepperRepeat(action);
    vi.advanceTimersByTime(500);
    stopRepeating();
    vi.advanceTimersByTime(500);

    expect(action).toHaveBeenCalledTimes(3);
  });
});
