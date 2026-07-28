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

import { createCropStream, resolveOnePixelEncodingCrop } from './crop-stream';
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
