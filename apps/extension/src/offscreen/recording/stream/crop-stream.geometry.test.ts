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

vi.mock('./frame-pump', async (importOriginal) => {
  const original = await importOriginal<typeof import('./frame-pump')>();
  return {
    ...original,
    startVideoFramePump: vi.fn((options: Parameters<typeof original.startVideoFramePump>[0]) => {
      options.drawLiveFrame();
      return vi.fn();
    }),
  };
});

import { createStream } from '../multi-source/media-stream.test-support';
import { createCropStream } from './crop-stream';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.waitForSourceMetadata.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('contains a genuinely changed source aspect inside an immutable canvas', async () => {
  const output = createStream(2346, 1080);
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
  const video = { videoHeight: 500, videoWidth: 1086 };
  mocks.createSourceVideo.mockReturnValue(video);

  await createCropStream(createStream(1086, 500), {
    fit: 'contain',
    sourceRect: { x: 0, y: 0, width: 1086, height: 500 },
    outputSize: { width: 2346, height: 1080 },
  });

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2346, 1080);
  expect(context.drawImage).toHaveBeenCalledWith(
    video,
    0,
    0,
    1086,
    500,
    expect.closeTo((2346 - (1086 * 1080) / 500) / 2),
    0,
    expect.closeTo((1086 * 1080) / 500),
    1080
  );
  output.getVideoTracks()[0]?.stop();
});
