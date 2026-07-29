// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSourceVideo: vi.fn(),
  releaseSourceVideo: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./video-source', () => ({
  createSourceVideo: mocks.createSourceVideo,
  releaseSourceVideo: mocks.releaseSourceVideo,
  waitForSourceMetadata: mocks.waitForSourceMetadata,
}));

import {
  createCropStream,
  createGatedCropStream,
  resolveOnePixelEncodingCrop,
} from './crop-stream';
import {
  createAudioStream,
  createEmptyStream,
  createStream,
  createTrackedStream,
  TestMediaStream,
} from '../multi-source/media-stream.test-support';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.waitForSourceMetadata.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('crop stream', () => {
  it('activates a suspended static viewport output without waiting for another source frame', async () => {
    const output = createTrackedStream();
    const context = { drawImage: vi.fn() };
    const requestVideoFrameCallback = vi.fn(() => 1);
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    mocks.createSourceVideo.mockReturnValue({
      cancelVideoFrameCallback: vi.fn(),
      requestVideoFrameCallback,
      videoHeight: 720,
      videoWidth: 1280,
    });

    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      },
      { initiallySuspended: true }
    );
    gated.controls.activate();

    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(requestVideoFrameCallback).not.toHaveBeenCalled();
    gated.stream.getVideoTracks()[0]?.stop();
  });

  it('keeps navigation freezes tokenized and retries a failed thaw deterministically', async () => {
    const output = createTrackedStream();
    const context = { drawImage: vi.fn() };
    const freshFrameCallbacks: Array<() => void> = [];
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    mocks.createSourceVideo.mockReturnValue({
      cancelVideoFrameCallback: vi.fn(),
      requestVideoFrameCallback: vi.fn((callback: () => void) => {
        freshFrameCallbacks.push(callback);
        return freshFrameCallbacks.length;
      }),
      videoHeight: 720,
      videoWidth: 1280,
    });

    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      },
      { initiallySuspended: true }
    );

    expect(context.drawImage).not.toHaveBeenCalled();
    expect(gated.controls.setFrozen('navigation-1', true)).toBe('applied');
    gated.controls.activate();
    expect(context.drawImage).not.toHaveBeenCalled();

    expect(gated.controls.setFrozen('navigation-2', true)).toBe('applied');
    expect(gated.controls.setFrozen('navigation-1', false)).toBe('stale');
    await vi.advanceTimersByTimeAsync(100);
    expect(context.drawImage).not.toHaveBeenCalled();

    const navigationTwoFrame = gated.controls.waitForFreshFrame('navigation-2');
    freshFrameCallbacks.shift()?.();
    await navigationTwoFrame;
    expect(
      gated.controls.applyFreshGeometry('navigation-2', {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      })
    ).toBe('applied');
    expect(gated.controls.setFrozen('navigation-2', false)).toBe('applied');
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(gated.controls.setFrozen('navigation-2', false)).toBe('applied');
    expect(gated.controls.setFrozen('navigation-2', true)).toBe('stale');
    expect(context.drawImage).toHaveBeenCalledOnce();

    expect(gated.controls.setFrozen('navigation-3', true)).toBe('applied');
    const navigationThreeFrame = gated.controls.waitForFreshFrame('navigation-3');
    freshFrameCallbacks.shift()?.();
    await navigationThreeFrame;
    expect(
      gated.controls.applyFreshGeometry('navigation-3', {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      })
    ).toBe('applied');
    context.drawImage.mockImplementationOnce(() => {
      throw new Error('fresh draw failed');
    });
    expect(() => gated.controls.setFrozen('navigation-3', false)).toThrow('fresh draw failed');
    await vi.advanceTimersByTimeAsync(100);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(gated.controls.setFrozen('navigation-3', false)).toBe('applied');
    expect(context.drawImage).toHaveBeenCalledTimes(3);

    gated.stream.getVideoTracks()[0]?.stop();
    expect(gated.controls.setFrozen('navigation-4', true)).toBe('stale');
  });

  it('keeps a viewport crop frozen until fresh post-navigation geometry is applied', async () => {
    const output = createTrackedStream();
    const context = { drawImage: vi.fn() };
    let presentFreshFrame!: () => void;
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    const video = {
      cancelVideoFrameCallback: vi.fn(),
      requestVideoFrameCallback: vi.fn((callback: () => void) => {
        presentFreshFrame = callback;
        return 17;
      }),
      videoHeight: 720,
      videoWidth: 1280,
    };
    mocks.createSourceVideo.mockReturnValue(video);

    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 100, y: 80, width: 300, height: 300 },
        outputSize: { width: 300, height: 300 },
      },
      { initiallySuspended: true }
    );
    gated.controls.activate();
    expect(gated.controls.setFrozen('navigation-1', true)).toBe('applied');

    const freshFrame = gated.controls.waitForFreshFrame('navigation-1');
    expect(() => gated.controls.setFrozen('navigation-1', false)).toThrow('fresh source geometry');
    await vi.advanceTimersByTimeAsync(100);
    expect(context.drawImage).toHaveBeenCalledOnce();

    video.videoWidth = 1920;
    video.videoHeight = 1080;
    presentFreshFrame();
    await expect(freshFrame).resolves.toEqual({ height: 1080, width: 1920 });
    expect(
      gated.controls.applyFreshGeometry('navigation-1', {
        sourceRect: { x: 150, y: 120, width: 450, height: 450 },
        outputSize: { width: 300, height: 300 },
      })
    ).toBe('applied');
    expect(gated.controls.setFrozen('navigation-1', false)).toBe('applied');
    expect(context.drawImage).toHaveBeenLastCalledWith(video, 150, 120, 450, 450, 0, 0, 300, 300);
  });

  it('draws an explicit raw source rectangle into an independent output size', async () => {
    const output = createTrackedStream();
    const context = { drawImage: vi.fn() };
    const canvases: HTMLCanvasElement[] = [];
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(function (this: HTMLCanvasElement) {
        canvases.push(this);
        return output;
      }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    const source = new TestMediaStream([
      ...createAudioStream().getAudioTracks(),
      ...createStream(2560, 1440).getVideoTracks(),
    ]);
    const video = { videoWidth: 2560, videoHeight: 1440 };
    mocks.createSourceVideo.mockReturnValue(video);

    await createCropStream(source, {
      sourceRect: { x: 200, y: 160, width: 600, height: 600 },
      outputSize: { width: 300, height: 300 },
    });

    expect(canvases[0]?.width).toBe(300);
    expect(canvases[0]?.height).toBe(300);
    expect(context.drawImage).toHaveBeenCalledWith(video, 200, 160, 600, 600, 0, 0, 300, 300);
    output.track.stop();
    expect(mocks.releaseSourceVideo).toHaveBeenCalledWith(video);
  });

  it('keeps a raw one-pixel encoding crop 1:1', () => {
    expect(resolveOnePixelEncodingCrop({ width: 1280, height: 720 })).toBeNull();
    expect(resolveOnePixelEncodingCrop({ width: 1279, height: 721 })).toEqual({
      sourceRect: { x: 0, y: 0, width: 1278, height: 720 },
      outputSize: { width: 1278, height: 720 },
    });
  });

  it('releases source-video ownership on setup failures', async () => {
    const video = { videoHeight: 80, videoWidth: 100 };
    mocks.createSourceVideo.mockReturnValue(video);
    mocks.waitForSourceMetadata.mockRejectedValueOnce(new Error('metadata failed'));

    await expect(
      createCropStream(createStream(100, 80), {
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        outputSize: { width: 100, height: 80 },
      })
    ).rejects.toThrow('metadata failed');
    expect(mocks.releaseSourceVideo).toHaveBeenCalledWith(video);
  });

  it('rejects a crop outside the source and a missing output owner', async () => {
    const context = { drawImage: vi.fn() };
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => createEmptyStream()),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    mocks.createSourceVideo.mockReturnValue({ videoHeight: 80, videoWidth: 100 });

    await expect(
      createCropStream(createStream(100, 80), {
        sourceRect: { x: 90, y: 0, width: 20, height: 20 },
        outputSize: { width: 20, height: 20 },
      })
    ).rejects.toThrow('inside the source');
    await expect(
      createCropStream(createStream(100, 80), {
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        outputSize: { width: 100, height: 80 },
      })
    ).rejects.toThrow('missing a video track');
  });
});
