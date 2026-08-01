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

import { createCropStream } from './crop-stream';
import {
  createAudioStream,
  createEmptyStream,
  createStream,
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
  it('draws an explicit raw source rectangle into an independent output size', async () => {
    const output = createStream(300, 300);
    const context = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
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
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(context.drawImage).toHaveBeenCalledWith(video, 200, 160, 600, 600, 0, 0, 300, 300);
    output.getVideoTracks()[0]?.stop();
    expect(mocks.releaseSourceVideo).toHaveBeenCalledWith(video);
  });

  it('keeps fixed encoder dimensions and contains a source that resizes during recording', async () => {
    const output = createStream(1902, 984);
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    const video = { videoHeight: 984, videoWidth: 1902 };
    mocks.createSourceVideo.mockReturnValue(video);

    await createCropStream(
      createStream(1902, 984),
      {
        sourceRect: { x: 0, y: 0, width: 1902, height: 984 },
        outputSize: { width: 1902, height: 984 },
      },
      { dynamicSourceFit: true, frameRate: 30 }
    );

    expect(context.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 1902, 984, 0, 0, 1902, 984);
    video.videoWidth = 1600;
    video.videoHeight = 900;
    vi.advanceTimersToNextTimer();

    expect(context.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 1600, 900, 76, 0, 1750, 984);
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 1902, 984);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');

    output.getVideoTracks()[0]?.stop();
  });

  it('uses a one-pixel 1:1 crop for an odd SOURCE frame before later resize fitting', async () => {
    const output = createStream(1278, 720);
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
    };
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    const video = { videoHeight: 721, videoWidth: 1279 };
    mocks.createSourceVideo.mockReturnValue(video);

    await createCropStream(
      createStream(1279, 721),
      {
        sourceRect: { x: 0, y: 0, width: 1279, height: 721 },
        outputSize: { width: 1278, height: 720 },
      },
      { cropOddSourceEdges: true, dynamicSourceFit: true, frameRate: 30 }
    );

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 1278, 720, 0, 0, 1278, 720);
    output.getVideoTracks()[0]?.stop();
  });

  it('normalizes a screen-sized raw TAB proxy to the initial logical viewport without bars', async () => {
    const output = createStream(1904, 984);
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => output),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => context),
    });
    const video = { videoHeight: 1440, videoWidth: 2560 };
    mocks.createSourceVideo.mockReturnValue(video);

    await createCropStream(
      createStream(2560, 1440),
      {
        sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
        outputSize: { width: 1904, height: 984 },
      },
      {
        cropOddSourceEdges: true,
        dynamicSourceFit: true,
        frameRate: 30,
        logicalSourceSize: { width: 1904, height: 985 },
      }
    );

    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenLastCalledWith(
      video,
      0,
      0,
      2560,
      (1440 * 984) / 985,
      0,
      0,
      1904,
      984
    );
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');

    video.videoWidth = 2400;
    vi.advanceTimersToNextTimer();
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 1904, 984);
    expect(context.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 2400, 1440, 60, 0, 1784, 984);
    output.getVideoTracks()[0]?.stop();
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
    ).rejects.toThrow('no video track');
  });
});
