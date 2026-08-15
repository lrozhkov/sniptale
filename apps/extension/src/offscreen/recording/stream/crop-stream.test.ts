// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';

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
import { createCropStream } from './crop-stream';
import { resolveTabOutputGeometry } from '../geometry/tab-source';

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

function installSolidPixelCanvasOutput(width: number, height: number) {
  const output = createStream(width, height);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const writePixel = (x: number, y: number, color: readonly [number, number, number, number]) => {
    const offset = (y * width + x) * 4;
    pixels.set(color, offset);
  };
  const context = {
    drawImage: vi.fn((...args: unknown[]) => {
      const [destinationX, destinationY, destinationWidth, destinationHeight] = args.slice(5) as [
        number,
        number,
        number,
        number,
      ];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const centerX = x + 0.5;
          const centerY = y + 0.5;
          if (
            centerX >= destinationX &&
            centerX < destinationX + destinationWidth &&
            centerY >= destinationY &&
            centerY < destinationY + destinationHeight
          ) {
            writePixel(x, y, [17, 113, 201, 255]);
          }
        }
      }
    }),
    fillRect: vi.fn(() => {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) writePixel(x, y, [0, 0, 0, 255]);
      }
    }),
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
  return { context, output, pixels };
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
  it.each([
    { devicePixelRatio: 1, raw: { width: 2560, height: 1440 } },
    { devicePixelRatio: 2, raw: { width: 3808, height: 1970 } },
  ])(
    'fills every TAB + SOURCE canvas edge at devicePixelRatio $devicePixelRatio',
    async ({ devicePixelRatio, raw }) => {
      const { context, output, pixels } = installSolidPixelCanvasOutput(1904, 984);
      const video = { videoHeight: raw.height, videoWidth: raw.width };
      mocks.createSourceVideo.mockReturnValue(video);
      const geometry = resolveTabOutputGeometry(
        { x: 0, y: 0, width: 1904, height: 985 },
        raw,
        { width: 1904, height: 985, devicePixelRatio },
        {
          frameRateCap: 30,
          resolution: VideoResolutionPreset.SOURCE,
          tracksFullViewport: true,
        }
      );

      await createCropStream(createStream(raw.width, raw.height), geometry);

      expect(geometry.outputSize).toEqual({ width: 1904, height: 984 });
      expect(geometry.outputSize.width % 2).toBe(0);
      expect(geometry.outputSize.height % 2).toBe(0);
      expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1904, 984);
      expect(context.drawImage).toHaveBeenCalledWith(
        video,
        geometry.sourceRect.x,
        geometry.sourceRect.y,
        geometry.sourceRect.width,
        geometry.sourceRect.height,
        0,
        0,
        1904,
        984
      );
      const edgePixelOffsets = [0, (1904 - 1) * 4, (984 - 1) * 1904 * 4, (984 * 1904 - 1) * 4];
      for (const offset of edgePixelOffsets) {
        expect([...pixels.slice(offset, offset + 4)]).toEqual([17, 113, 201, 255]);
      }
      output.getVideoTracks()[0]?.stop();
    }
  );

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

  it('rejects non-contain geometry', async () => {
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
  });

  it('rejects a full-output destination when the sampled aspect does not match', async () => {
    installCanvasOutput(100, 80);
    mocks.createSourceVideo.mockReturnValue({ videoHeight: 80, videoWidth: 100 });

    await expect(
      createCropStream(createStream(100, 80), {
        fillsOutput: true,
        sourceRect: { x: 0, y: 0, width: 100, height: 70 },
        outputSize: { width: 100, height: 80 },
      })
    ).rejects.toThrow('must preserve the sampled source aspect');
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
