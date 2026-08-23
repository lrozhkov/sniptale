import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestVideoSampleInit = {
  colorSpace?: VideoColorSpaceInit;
  duration?: number;
  timestamp?: number;
};

const samples = vi.hoisted(() => [] as Array<{ frame: VideoFrame; init: TestVideoSampleInit }>);

vi.mock('mediabunny', () => ({
  VideoSample: class {
    readonly codedHeight = 1;
    readonly codedWidth = 1;
    readonly displayHeight = 1;
    readonly displayWidth = 1;
    readonly format = 'RGBA';
    readonly visibleRect = null;
    readonly colorSpace = { toJSON: () => ({}) };

    constructor(
      readonly frame: VideoFrame,
      readonly init: TestVideoSampleInit = {}
    ) {
      samples.push({ frame, init });
    }

    close(): void {
      this.frame.close();
    }
  },
}));

import { LiveVideoFrameBuffer } from './live-video-frame-buffer';
import { evaluateLiveVideoByteBudget } from './live-video-budget';
import { runLiveVideoEncoderPump } from './live-video-encoder-pump';
import { VideoSample } from 'mediabunny';

beforeEach(() => {
  samples.length = 0;
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
      readonly colorSpace: { toJSON(): VideoColorSpaceInit };
      readonly duration: number | undefined;
      readonly timestamp: number;
      readonly visibleRect = null;

      constructor(_data: AllowSharedBufferSource | VideoFrame, init: VideoFrameBufferInit) {
        const colorSpace = init.colorSpace;
        this.colorSpace = { toJSON: () => colorSpace ?? {} };
        this.duration = init.duration ?? undefined;
        this.timestamp = init.timestamp;
      }

      readonly codedHeight = 1;
      readonly codedWidth = 1;
      readonly displayHeight = 1;
      readonly displayWidth = 1;
    }
  );
});

describe('live video encoder pump', () => {
  it('keeps a jittery 15-second screen recording inside its forced-keyframe byte budget', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(1_000);
    const framePeriod = 1 / 60;
    let timestamp = 0;
    let frameIndex = 0;
    while (timestamp < 15) {
      const frame = new VideoFrame(new Uint8Array(4), {
        codedHeight: 1,
        codedWidth: 1,
        format: 'RGBA',
        timestamp: Math.round(timestamp * 1_000_000),
      });
      frameBuffer.enqueue({ frame, timestampSeconds: timestamp });
      frameIndex += 1;
      timestamp += frameIndex % 12 === 0 ? 0.08 : framePeriod;
    }
    frameBuffer.closeInput();
    let modeledVideoBytes = 0;
    const add = vi.fn(async (_sample: unknown, options?: VideoEncoderEncodeOptions) => {
      modeledVideoBytes += options?.keyFrame ? 100_000 : 2_000;
    });

    const metrics = await runLiveVideoEncoderPump({
      frameBuffer,
      frameRate: 60,
      onFrameDequeued: vi.fn(),
      shouldEncodeTerminalFrame: () => true,
      videoSource: { add },
    });

    const videoByteBudget = evaluateLiveVideoByteBudget({
      configuredBitrate: 1_000_000,
      duration: 15,
      encodedBytes: modeledVideoBytes,
    });
    expect(metrics.forcedKeyFrames).toBe(1);
    expect(videoByteBudget.withinBudget).toBe(true);
  });

  it('drops a rate-capped frame without reassigning its timestamp to different content', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(4);
    const first = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    const excess = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 16_667,
    });
    const next = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 33_334,
    });
    frameBuffer.enqueue({ frame: first, timestampSeconds: 0 });
    frameBuffer.enqueue({ frame: excess, timestampSeconds: 0.016667 });
    frameBuffer.enqueue({ frame: next, timestampSeconds: 0.033334 });
    frameBuffer.closeInput();
    const add = vi.fn(async (_sample: unknown, _options?: VideoEncoderEncodeOptions) => undefined);

    const metrics = await runLiveVideoEncoderPump({
      frameBuffer,
      frameRate: 30,
      onFrameDequeued: vi.fn(),
      shouldEncodeTerminalFrame: () => true,
      videoSource: { add },
    });

    expect(samples.map(({ frame, init }) => ({ frame, timestamp: init.timestamp }))).toEqual([
      { frame: first, timestamp: 0 },
      { frame: next, timestamp: 1 / 30 },
    ]);
    expect(metrics).toEqual(expect.objectContaining({ coalescedVideoFrames: 1 }));
    expect(excess.close).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(next.close).toHaveBeenCalledOnce();
  });

  it('submits the source frame without overriding its color metadata', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(2);
    const frame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    frameBuffer.enqueue({ frame, timestampSeconds: 0 });
    frameBuffer.closeInput();
    const add = vi.fn(async (_sample: unknown, _options?: VideoEncoderEncodeOptions) => undefined);
    const legacyColorOverride = {
      sampleColorSpace: {
        fullRange: true,
        matrix: 'bt709',
        primaries: 'bt709',
        transfer: 'bt709',
      },
    } as const;
    await runLiveVideoEncoderPump({
      frameBuffer,
      frameRate: 30,
      ...legacyColorOverride,
      onFrameDequeued: vi.fn(),
      shouldEncodeTerminalFrame: () => true,
      videoSource: { add },
    });

    expect(samples).toHaveLength(1);
    expect(samples[0]?.frame).toBe(frame);
    expect(samples[0]?.init).toEqual({ duration: 1 / 30, timestamp: 0 });
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('submits a transformed sample while retaining source-frame ownership', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(2);
    const sourceFrame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    const transformedFrame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    const transformedSample = new VideoSample(transformedFrame);
    const transformFrame = vi.fn(() => transformedSample);
    frameBuffer.enqueue({ frame: sourceFrame, timestampSeconds: 0 });
    frameBuffer.closeInput();

    const metrics = await runLiveVideoEncoderPump({
      frameBuffer,
      frameRate: 30,
      frameTransformer: { transformFrame },
      onFrameDequeued: vi.fn(),
      shouldEncodeTerminalFrame: () => true,
      videoSource: { add: vi.fn().mockResolvedValue(undefined) },
    });

    expect(transformFrame).toHaveBeenCalledWith(
      sourceFrame,
      expect.objectContaining({ timestamp: 0 })
    );
    expect(metrics.transformedVideoFrames).toBe(1);
    expect(sourceFrame.close).toHaveBeenCalledOnce();
    expect(transformedFrame.close).toHaveBeenCalledOnce();
  });

  it('closes the already-dequeued successor when encoding the pending frame fails', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(2);
    const first = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    const successor = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 33_334,
    });
    frameBuffer.enqueue({ frame: first, timestampSeconds: 0 });
    frameBuffer.enqueue({ frame: successor, timestampSeconds: 0.033334 });
    frameBuffer.closeInput();
    const error = new Error('encode failed');

    await expect(
      runLiveVideoEncoderPump({
        frameBuffer,
        frameRate: 30,
        onFrameDequeued: vi.fn(),
        shouldEncodeTerminalFrame: () => true,
        videoSource: { add: vi.fn(() => Promise.reject(error)) },
      })
    ).rejects.toBe(error);
    expect(first.close).toHaveBeenCalledOnce();
    expect(successor.close).toHaveBeenCalledOnce();
  });

  it('shifts a resumed segment past the pre-pause end while retaining its first frame', async () => {
    const frameBuffer = new LiveVideoFrameBuffer(5);
    const frames = [0, 33_334, 33_334, 66_668].map(
      (timestamp) =>
        new VideoFrame(new Uint8Array(4), {
          codedHeight: 1,
          codedWidth: 1,
          format: 'RGBA',
          timestamp,
        })
    );
    frameBuffer.enqueue({ frame: frames[0]!, timestampSeconds: 0 });
    frameBuffer.enqueue({ frame: frames[1]!, timestampSeconds: 0.033334 });
    frameBuffer.enqueue({
      frame: frames[2]!,
      startsNewSegment: true,
      timestampSeconds: 0.033334,
    });
    frameBuffer.enqueue({ frame: frames[3]!, timestampSeconds: 0.066668 });
    frameBuffer.closeInput();
    const add = vi.fn(async (_sample: unknown, _options?: VideoEncoderEncodeOptions) => undefined);

    await runLiveVideoEncoderPump({
      frameBuffer,
      frameRate: 30,
      onFrameDequeued: vi.fn(),
      shouldEncodeTerminalFrame: () => true,
      videoSource: { add },
    });

    expect(
      samples.map(({ frame, init }, index) => ({
        frame,
        init: {
          duration: Number(init.duration!.toFixed(6)),
          timestamp: Number(init.timestamp!.toFixed(6)),
        },
        keyFrame: add.mock.calls[index]?.[1],
      }))
    ).toEqual([
      {
        frame: frames[0],
        init: { duration: 0.033333, timestamp: 0 },
        keyFrame: { keyFrame: true },
      },
      {
        frame: frames[1],
        init: { duration: 0.033333, timestamp: 0.033333 },
        keyFrame: undefined,
      },
      {
        frame: frames[2],
        init: { duration: 0.033333, timestamp: 0.066667 },
        keyFrame: { keyFrame: true },
      },
      {
        frame: frames[3],
        init: { duration: 0.033333, timestamp: 0.1 },
        keyFrame: undefined,
      },
    ]);
  });
});
