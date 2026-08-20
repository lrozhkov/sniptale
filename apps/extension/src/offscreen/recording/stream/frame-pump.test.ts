// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFixedVideoFrameRate, startVideoFramePump } from './frame-pump';

const FRAME_METADATA: VideoFrameCallbackMetadata = {
  expectedDisplayTime: 0,
  height: 720,
  mediaTime: 0,
  presentationTime: 0,
  presentedFrames: 1,
  processingDuration: 0,
  width: 1280,
};

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

  it('gates source video callbacks to the selected cadence and cancels ownership on stop', () => {
    const callbacks = new Map<number, VideoFrameRequestCallback>();
    let nextId = 0;
    const sourceVideo = Object.assign(document.createElement('video'), {
      cancelVideoFrameCallback: vi.fn((id: number) => callbacks.delete(id)),
      requestVideoFrameCallback: vi.fn((callback: VideoFrameRequestCallback) => {
        nextId += 1;
        callbacks.set(nextId, callback);
        return nextId;
      }),
    });
    const drawLiveFrame = vi.fn(() => true);
    const onFrameDrawn = vi.fn();
    const stop = startVideoFramePump({
      drawLiveFrame,
      frameRate: 24,
      onFrameDrawn,
      sourceVideo,
    });
    const emit = (now: number) => {
      const entry = [...callbacks.entries()][0];
      if (!entry) throw new Error('Source callback was not scheduled');
      callbacks.delete(entry[0]);
      entry[1](now, FRAME_METADATA);
    };

    emit(0);
    emit(16.7);
    emit(33.4);
    emit(50.1);

    expect(drawLiveFrame).toHaveBeenCalledTimes(2);
    expect(onFrameDrawn).toHaveBeenCalledTimes(2);
    stop();
    expect(sourceVideo.cancelVideoFrameCallback).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
  });

  it('uses an accumulated deadline instead of collapsing 30 FPS source frames to 15 FPS at 24', () => {
    let callback: VideoFrameRequestCallback | null = null;
    const sourceVideo = Object.assign(document.createElement('video'), {
      cancelVideoFrameCallback: vi.fn(),
      requestVideoFrameCallback: vi.fn((next: VideoFrameRequestCallback) => {
        callback = next;
        return 1;
      }),
    });
    const onFrameDrawn = vi.fn();
    const stop = startVideoFramePump({
      drawLiveFrame: () => true,
      frameRate: 24,
      onFrameDrawn,
      sourceVideo,
    });

    for (let frame = 0; frame <= 30; frame += 1) {
      const current = callback as VideoFrameRequestCallback | null;
      if (!current) throw new Error('Source callback was not scheduled');
      current((frame * 1000) / 30, FRAME_METADATA);
    }

    expect(onFrameDrawn.mock.calls.length).toBeGreaterThanOrEqual(24);
    expect(onFrameDrawn.mock.calls.length).toBeLessThanOrEqual(25);
    stop();
  });
});
