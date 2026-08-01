// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { startVideoFramePump } from './frame-pump';

afterEach(() => {
  vi.useRealTimers();
});

describe('video frame pump', () => {
  it('keeps the selected output cadence without depending on source frame callbacks', () => {
    vi.useFakeTimers();
    const drawLiveFrame = vi.fn();
    const stop = startVideoFramePump({ drawLiveFrame, frameRate: 60 });

    vi.advanceTimersByTime(1000);
    expect(drawLiveFrame).toHaveBeenCalledTimes(60);

    stop();
    stop();
    vi.advanceTimersByTime(1000);
    expect(drawLiveFrame).toHaveBeenCalledTimes(60);
  });

  it('ticks live and held-frame gates from the same compensated cadence', () => {
    vi.useFakeTimers();
    const drawLiveFrame = vi.fn();
    const drawHeldFrame = vi.fn();
    const stop = startVideoFramePump({
      drawHeldFrame,
      drawLiveFrame,
      frameRate: 30,
    });

    vi.advanceTimersByTime(1000);
    expect(drawLiveFrame).toHaveBeenCalledTimes(30);
    expect(drawHeldFrame).toHaveBeenCalledTimes(30);
    stop();
  });

  it('skips missed deadlines without scheduling a burst of catch-up frames', () => {
    vi.useFakeTimers();
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(350)
      .mockReturnValue(350);
    const drawLiveFrame = vi.fn();
    const stop = startVideoFramePump({ drawLiveFrame, frameRate: 10 });

    vi.advanceTimersByTime(100);
    expect(drawLiveFrame).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(49);
    expect(drawLiveFrame).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(drawLiveFrame).toHaveBeenCalledTimes(2);

    stop();
    now.mockRestore();
  });
});
