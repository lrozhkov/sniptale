// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFixedVideoFrameRate, startVideoFramePump } from './frame-pump';

afterEach(() => {
  vi.useRealTimers();
});

describe('video frame pump', () => {
  it('resolves one start-time cadence from the requested and reported source caps', () => {
    expect(resolveFixedVideoFrameRate(60, 30)).toBe(30);
    expect(resolveFixedVideoFrameRate(30, 60)).toBe(30);
    expect(resolveFixedVideoFrameRate(24, undefined)).toBe(24);
    expect(resolveFixedVideoFrameRate(30, Number.NaN)).toBe(30);
  });

  it('uses one capped compensated timer for every source', () => {
    vi.useFakeTimers();
    const drawLiveFrame = vi.fn(() => true);
    const stop = startVideoFramePump({ drawLiveFrame, frameRate: 30 });

    vi.advanceTimersByTime(1000);
    expect(drawLiveFrame).toHaveBeenCalledTimes(30);

    stop();
    vi.advanceTimersByTime(1000);
    expect(drawLiveFrame).toHaveBeenCalledTimes(30);
  });

  it('emits held frames only when the live gate declines the timer tick', () => {
    vi.useFakeTimers();
    const drawLiveFrame = vi.fn(() => false);
    const drawHeldFrame = vi.fn(() => true);
    const stop = startVideoFramePump({
      drawHeldFrame,
      drawLiveFrame,
      frameRate: 60,
    });

    vi.advanceTimersByTime(1000 / 60);
    expect(drawLiveFrame).toHaveBeenCalledOnce();
    expect(drawHeldFrame).toHaveBeenCalledOnce();
    stop();
  });
});
