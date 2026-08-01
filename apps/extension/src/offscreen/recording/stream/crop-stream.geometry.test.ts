// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSourceVideo: vi.fn(),
  releaseSourceVideo: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./video-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./video-source')>()),
  createSourceVideo: mocks.createSourceVideo,
  releaseSourceVideo: mocks.releaseSourceVideo,
  waitForSourceMetadata: mocks.waitForSourceMetadata,
}));

import { createStream } from '../multi-source/media-stream.test-support';
import { createCropStream } from './crop-stream';

function installCanvasOutput(width: number, height: number) {
  const output = createStream(width, height);
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

it('cover-crops a tab content rectangle with one uniform scale', async () => {
  const { context, output } = installCanvasOutput(1904, 984);
  const video = { videoHeight: 1440, videoWidth: 2560 };
  mocks.createSourceVideo.mockReturnValue(video);

  await createCropStream(createStream(2560, 1440), {
    fit: 'cover',
    sourceRect: { x: 0, y: 58, width: 2560, height: 1324 },
    outputSize: { width: 1904, height: 984 },
  });

  expect(context.drawImage).toHaveBeenCalledWith(
    video,
    0,
    expect.closeTo(58 + (1324 - (2560 * 984) / 1904) / 2),
    2560,
    expect.closeTo((2560 * 984) / 1904),
    0,
    0,
    1904,
    984
  );
  output.getVideoTracks()[0]?.stop();
});

it('contains a remapped full viewport in the fixed encoder canvas', async () => {
  const { context, output } = installCanvasOutput(1904, 984);
  const video = { videoHeight: 1440, videoWidth: 2560 };
  mocks.createSourceVideo.mockReturnValue(video);

  await createCropStream(createStream(2560, 1440), {
    fit: 'contain',
    sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
    outputSize: { width: 1904, height: 984 },
  });

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1904, 984);
  expect(context.drawImage).toHaveBeenCalledWith(
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
  output.getVideoTracks()[0]?.stop();
});

it('uses a one-pixel 1:1 crop for controlled Source output', async () => {
  const { context, output } = installCanvasOutput(1278, 720);
  const video = { videoHeight: 721, videoWidth: 1279 };
  mocks.createSourceVideo.mockReturnValue(video);

  await createCropStream(createStream(1279, 721), {
    fit: 'source',
    sourceRect: { x: 0, y: 0, width: 1279, height: 721 },
    outputSize: { width: 1278, height: 720 },
  });

  expect(context.imageSmoothingEnabled).toBe(false);
  expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 1278, 720, 0, 0, 1278, 720);
  output.getVideoTracks()[0]?.stop();
});
