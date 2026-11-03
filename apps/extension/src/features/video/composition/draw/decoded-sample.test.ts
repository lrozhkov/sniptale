import { expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { prepareDecodedVideoSample } from './decoded-sample';

function createSample() {
  return new VideoSample(new Uint8Array(24), {
    format: 'I420',
    codedWidth: 4,
    codedHeight: 4,
    timestamp: 2,
    duration: 1 / 30,
  });
}

it('transfers an already drawable sample without a copy or early release', async () => {
  const sample = createSample();
  const close = vi.spyOn(sample, 'close');
  expect(await prepareDecodedVideoSample(sample, new AbortController().signal)).toBe(sample);
  expect(close).not.toHaveBeenCalled();
  expect(sample.timestamp).toBe(2);
  sample.close();
});

it('releases an acquired sample when its owner was cancelled', async () => {
  const sample = createSample();
  const close = vi.spyOn(sample, 'close');
  const controller = new AbortController();
  controller.abort();
  await expect(prepareDecodedVideoSample(sample, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(close).toHaveBeenCalledOnce();
});

it('transfers an unpadded native sample with timing and rotation intact until its consumer closes it', async () => {
  const frames: NativeFrame[] = [];
  class NativeFrame {
    format: VideoPixelFormat;
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    timestamp: number;
    duration: number | null;
    colorSpace: VideoColorSpaceInit;
    visibleRect: { x: number; y: number; width: number; height: number };
    close = vi.fn();
    constructor(_bytes: AllowSharedBufferSource, init: VideoFrameBufferInit) {
      this.format = init.format;
      this.codedWidth = init.codedWidth;
      this.codedHeight = init.codedHeight;
      this.displayWidth = init.displayWidth ?? init.codedWidth;
      this.displayHeight = init.displayHeight ?? init.codedHeight;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? null;
      this.colorSpace = init.colorSpace ?? {};
      this.visibleRect = { x: 0, y: 0, width: init.codedWidth, height: init.codedHeight };
      frames.push(this);
    }
  }
  vi.stubGlobal('VideoFrame', NativeFrame);
  const sample = new VideoSample(new Uint8Array(24), {
    format: 'NV12',
    codedWidth: 4,
    codedHeight: 4,
    displayWidth: 8,
    displayHeight: 4,
    timestamp: 2,
    duration: 1 / 30,
    rotation: 90,
    flip: true,
  });
  const display = [sample.displayWidth, sample.displayHeight];
  const close = vi.spyOn(sample, 'close');
  try {
    const prepared = await prepareDecodedVideoSample(sample, new AbortController().signal);
    expect(prepared.timestamp).toBe(2);
    expect(prepared.duration).toBe(1 / 30);
    expect(prepared.rotation).toBe(90);
    expect(prepared.flip).toBe(true);
    expect([prepared.displayWidth, prepared.displayHeight]).toEqual(display);
    expect(close).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(1);
    expect(frames[0]!.close).not.toHaveBeenCalled();
    prepared.close();
    expect(frames[0]!.close).toHaveBeenCalledOnce();
  } finally {
    sample.close();
    vi.unstubAllGlobals();
  }
});

it('packs padded NV12 visible planes before canvas conversion without changing display geometry', async () => {
  const frame = {
    format: 'NV12',
    visibleRect: { x: 0, y: 0, width: 1904, height: 984 },
    codedWidth: 1904,
    codedHeight: 992,
    displayWidth: 1904,
    displayHeight: 984,
    colorSpace: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false },
    timestamp: 15_000_000,
    duration: 33_333,
    allocationSize: vi.fn(() => 1904 * 984 * 1.5),
    copyTo: vi.fn(async () => [
      { offset: 0, stride: 1904 },
      { offset: 1904 * 984, stride: 1904 },
    ]),
    close: vi.fn(),
  };
  const packed = { close: vi.fn() };
  const constructor = vi.fn(function () {
    return packed;
  });
  vi.stubGlobal('VideoFrame', constructor);
  try {
    const { prepareDecodedVideoFrame } = await import('./decoded-sample');
    const result = await prepareDecodedVideoFrame(
      frame as unknown as VideoFrame,
      new AbortController().signal
    );
    expect(result).toBe(packed);
    expect(constructor).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        format: 'NV12',
        codedWidth: 1904,
        codedHeight: 984,
        displayWidth: 1904,
        displayHeight: 984,
        timestamp: 15_000_000,
        duration: 33_333,
        colorSpace: frame.colorSpace,
        layout: [
          { offset: 0, stride: 1904 },
          { offset: 1904 * 984, stride: 1904 },
        ],
      })
    );
    expect(frame.copyTo).toHaveBeenCalledOnce();
    expect(frame.close).toHaveBeenCalledOnce();
    expect(packed.close).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
