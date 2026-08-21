// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
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
  it('allows downsampling but rejects an unavailable higher source cadence', () => {
    expect(() => resolveFixedVideoFrameRate(60, 30)).toThrow(
      'requested 60 FPS, source provides 30 FPS'
    );
    expect(resolveFixedVideoFrameRate(30, 60)).toBe(30);
    expect(resolveFixedVideoFrameRate(24, undefined)).toBe(24);
  });

  it('does not report fractional 59.94 FPS source cadence as selected 60 FPS', () => {
    expect(() => resolveFixedVideoFrameRate(60, 59.94)).toThrow(
      'requested 60 FPS, source provides 59.94 FPS'
    );
    expect(() => resolveFixedVideoFrameRate(60, 59.999)).toThrow(
      'requested 60 FPS, source provides 59.999 FPS'
    );
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

  it('keeps emitting without depending on browser video frame callbacks', () => {
    vi.useFakeTimers();
    const drawLiveFrame = vi.fn(() => true);
    const stop = startVideoFramePump({ drawLiveFrame, frameRate: 30 });

    vi.advanceTimersByTime(1_000);

    expect(drawLiveFrame).toHaveBeenCalledTimes(30);
    stop();
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

  it('emits only delivered camera frames and cancels callback ownership on stop', () => {
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

    expect(drawLiveFrame).not.toHaveBeenCalled();
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

  it('preserves source-timeline phase for 30 to 24 FPS camera output', () => {
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

  it('emits transformed output only for new source frames and drops excess cadence', async () => {
    class TestFrame {
      readonly close = vi.fn();
      constructor(readonly timestamp: number) {}
    }
    const processorHarness: {
      controller?: ReadableStreamDefaultController<TestFrame>;
    } = {};
    class TestMediaStreamTrackProcessor {
      readonly readable = new ReadableStream<TestFrame>({
        start: (controller) => {
          processorHarness.controller = controller;
        },
      });
    }
    vi.stubGlobal('MediaStreamTrackProcessor', TestMediaStreamTrackProcessor);
    const drawLiveFrame = vi.fn((_frame?: VideoFrame) => true);
    const sourceTrack = createTrackedStream({ frameRate: 60 }).track;
    const stop = startVideoFramePump({ drawLiveFrame, frameRate: 30, sourceTrack });

    processorHarness.controller?.enqueue(new TestFrame(0));
    processorHarness.controller?.enqueue(new TestFrame(16_667));
    processorHarness.controller?.enqueue(new TestFrame(33_334));
    await vi.waitFor(() => expect(drawLiveFrame).toHaveBeenCalledTimes(2));

    expect(drawLiveFrame.mock.calls.map(([frame]) => frame?.timestamp)).toEqual([0, 33_334]);
    stop();
  });

  it.each([
    { sourceFrameRate: 60, targetFrameRate: 24 },
    { sourceFrameRate: 30, targetFrameRate: 24 },
  ])(
    'preserves source-timeline phase for $sourceFrameRate to $targetFrameRate FPS',
    async ({ sourceFrameRate, targetFrameRate }) => {
      class TestFrame {
        readonly close = vi.fn();
        constructor(readonly timestamp: number) {}
      }
      const processorHarness: { controller?: ReadableStreamDefaultController<TestFrame> } = {};
      vi.stubGlobal(
        'MediaStreamTrackProcessor',
        class {
          readonly readable = new ReadableStream<TestFrame>({
            start: (controller) => {
              processorHarness.controller = controller;
            },
          });
        }
      );
      const drawLiveFrame = vi.fn((_frame?: VideoFrame) => true);
      const sourceTrack = createTrackedStream({ frameRate: sourceFrameRate }).track;
      const stop = startVideoFramePump({
        drawLiveFrame,
        frameRate: targetFrameRate,
        sourceTrack,
      });

      for (let index = 0; index < sourceFrameRate; index += 1) {
        processorHarness.controller?.enqueue(
          new TestFrame(Math.round((index * 1_000_000) / sourceFrameRate))
        );
      }
      await vi.waitFor(() => expect(drawLiveFrame).toHaveBeenCalledTimes(targetFrameRate));

      expect(drawLiveFrame).toHaveBeenCalledTimes(targetFrameRate);
      stop();
    }
  );
});
