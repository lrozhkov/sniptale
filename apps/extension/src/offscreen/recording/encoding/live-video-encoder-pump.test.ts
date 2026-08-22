import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestVideoSampleInit = { duration: number; timestamp: number };

const samples = vi.hoisted(() => [] as Array<{ frame: VideoFrame; init: TestVideoSampleInit }>);

vi.mock('mediabunny', () => ({
  VideoSample: class {
    readonly codedHeight = 1;
    readonly codedWidth = 1;
    readonly displayHeight = 1;
    readonly displayWidth = 1;
    readonly format = 'RGBA';
    readonly visibleRect = null;

    constructor(
      readonly frame: VideoFrame,
      readonly init: TestVideoSampleInit
    ) {
      samples.push({ frame, init });
    }

    close(): void {
      this.frame.close();
    }
  },
}));

import { LiveVideoFrameBuffer } from './live-video-frame-buffer';
import { runLiveVideoEncoderPump } from './live-video-encoder-pump';

beforeEach(() => {
  samples.length = 0;
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
      readonly timestamp: number;

      constructor(_data: AllowSharedBufferSource, init: VideoFrameBufferInit) {
        this.timestamp = init.timestamp;
      }
    }
  );
});

describe('live video encoder pump', () => {
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
      { frame: next, timestamp: 0.033334 },
    ]);
    expect(metrics).toEqual(expect.objectContaining({ coalescedVideoFrames: 1 }));
    expect(excess.close).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(next.close).toHaveBeenCalledOnce();
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
          duration: Number(init.duration.toFixed(6)),
          timestamp: Number(init.timestamp.toFixed(6)),
        },
        keyFrame: add.mock.calls[index]?.[1],
      }))
    ).toEqual([
      {
        frame: frames[0],
        init: { duration: 0.033334, timestamp: 0 },
        keyFrame: { keyFrame: true },
      },
      {
        frame: frames[1],
        init: { duration: 0.033334, timestamp: 0.033334 },
        keyFrame: undefined,
      },
      {
        frame: frames[2],
        init: { duration: 0.033334, timestamp: 0.066668 },
        keyFrame: { keyFrame: true },
      },
      {
        frame: frames[3],
        init: { duration: 0.033334, timestamp: 0.100002 },
        keyFrame: undefined,
      },
    ]);
  });
});
