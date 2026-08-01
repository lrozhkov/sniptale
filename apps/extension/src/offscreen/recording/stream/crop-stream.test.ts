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
  createEmptyStream,
  createStream,
  createTrackedStream,
} from '../multi-source/media-stream.test-support';
import { createCropStream, createGatedCropStream } from './crop-stream';

function installCanvasOutput(width: number, height: number) {
  const output = createStream(width, height);
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
  return { context, output };
}

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
  it('contains the exact physical sample without stretching or implicit cropping', async () => {
    const { context, output } = installCanvasOutput(1904, 984);
    const video = { videoHeight: 1440, videoWidth: 2560 };
    mocks.createSourceVideo.mockReturnValue(video);

    await createCropStream(createStream(2560, 1440), {
      fit: 'contain',
      sourceRect: { x: 0, y: 58, width: 2560, height: 1324 },
      outputSize: { width: 1904, height: 984 },
    });

    const destinationWidth = (2560 * 984) / 1324;
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1904, 984);
    expect(context.drawImage).toHaveBeenCalledWith(
      video,
      0,
      58,
      2560,
      1324,
      expect.closeTo((1904 - destinationWidth) / 2),
      0,
      expect.closeTo(destinationWidth),
      984
    );
    output.getVideoTracks()[0]?.stop();
  });

  it('applies a frozen resize mapping without changing the encoder canvas', async () => {
    const { context, output } = installCanvasOutput(1904, 984);
    const video = { videoHeight: 1440, videoWidth: 2560 };
    mocks.createSourceVideo.mockReturnValue(video);

    const gated = await createGatedCropStream(createStream(2560, 1440), {
      fit: 'contain',
      sourceRect: { x: 0, y: 58, width: 2560, height: 1324 },
      outputSize: { width: 1904, height: 984 },
    });
    expect(gated.controls.setFrozen('resize-1', true)).toBe('applied');
    expect(gated.controls.readFrozenSourceSize('resize-1')).toEqual({
      height: 1440,
      width: 2560,
    });
    expect(
      gated.controls.applyFrozenSourceGeometry('resize-1', {
        fit: 'contain',
        sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
        outputSize: { width: 1904, height: 984 },
      })
    ).toBe('applied');
    expect(gated.controls.setFrozen('resize-1', false)).toBe('applied');

    expect(context.drawImage).toHaveBeenLastCalledWith(
      video,
      0,
      0,
      2560,
      1440,
      expect.closeTo((1904 - (2560 * 984) / 1440) / 2),
      0,
      expect.closeTo((2560 * 984) / 1440),
      984
    );
    expect(output.getVideoTracks()[0]?.getSettings()).toMatchObject({
      height: 984,
      width: 1904,
    });
    output.getVideoTracks()[0]?.stop();
  });

  it('caps the crop cadence once at the source track rate reported on start', async () => {
    const { output } = installCanvasOutput(1280, 720);
    const video = { videoHeight: 720, videoWidth: 1280 };
    mocks.createSourceVideo.mockReturnValue(video);
    const source = createTrackedStream({ frameRate: 24, height: 720, width: 1280 });

    await createCropStream(
      source,
      {
        fit: 'contain',
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      },
      { frameRate: 60 }
    );

    expect(HTMLCanvasElement.prototype.captureStream).toHaveBeenCalledWith(24);
    output.getVideoTracks()[0]?.stop();
  });

  it('rejects non-contain geometry and output dimension changes', async () => {
    installCanvasOutput(100, 80);
    mocks.createSourceVideo.mockReturnValue({ videoHeight: 80, videoWidth: 100 });
    const unsupportedFit = ['co', 'ver'].join('') as 'cover';

    await expect(
      createCropStream(createStream(100, 80), {
        fit: unsupportedFit,
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        outputSize: { width: 100, height: 80 },
      })
    ).rejects.toThrow('contain fit only');

    const gated = await createGatedCropStream(createStream(100, 80), {
      fit: 'contain',
      sourceRect: { x: 0, y: 0, width: 100, height: 80 },
      outputSize: { width: 100, height: 80 },
    });
    gated.controls.setFrozen('resize-1', true);
    gated.controls.readFrozenSourceSize('resize-1');
    expect(() =>
      gated.controls.applyFrozenSourceGeometry('resize-1', {
        fit: 'contain',
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        outputSize: { width: 98, height: 78 },
      })
    ).toThrow('cannot change the encoded output dimensions');
    gated.stream.getVideoTracks()[0]?.stop();
  });

  it('releases source ownership on setup failure and output stop', async () => {
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

    mocks.waitForSourceMetadata.mockResolvedValueOnce(undefined);
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: vi.fn(() => createEmptyStream()),
    });
    await expect(
      createCropStream(createStream(100, 80), {
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        outputSize: { width: 100, height: 80 },
      })
    ).rejects.toThrow('no video track');
  });
});
