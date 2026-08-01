// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { createSourceVideoMock, waitForSourceMetadataMock } = vi.hoisted(() => ({
  createSourceVideoMock: vi.fn(),
  waitForSourceMetadataMock: vi.fn(),
}));

vi.mock('./video-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./video-source')>()),
  createSourceVideo: createSourceVideoMock,
  waitForSourceMetadata: waitForSourceMetadataMock,
}));

import { createFixedVideoOutputStream } from './fixed-video-output';
import {
  VideoQuality,
  VideoResolutionPreset,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createEmptyStream,
  createStream,
  createTrackedStream,
} from '../multi-source/media-stream.test-support';

function createSettings(
  resolution: VideoRecordingSettings['output']['resolution'] = VideoResolutionPreset.SOURCE
): Pick<VideoRecordingSettings, 'output' | 'quality'> {
  return {
    output: { ...DEFAULT_VIDEO_SETTINGS.output, resolution },
    quality: VideoQuality.HIGH,
  };
}

function createSourceStream() {
  return createTrackedStream({ height: 1304, width: 2560 });
}

function installCanvasFixture(stream: MediaStream) {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    set fillStyle(_value: string) {},
  };
  const canvas = Object.assign(document.createElement('canvas'), {
    captureStream: vi.fn(() => stream),
    getContext: vi.fn(() => ctx),
  });
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  return { canvas, ctx };
}

function installBrokenCanvasFixture(params: { stream: MediaStream; withContext: boolean }) {
  const canvas = Object.assign(document.createElement('canvas'), {
    captureStream: vi.fn(() => params.stream),
    getContext: vi.fn(() => (params.withContext ? { clearRect: vi.fn() } : null)),
  });
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  waitForSourceMetadataMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

it('records multi-source video through a fixed-size canvas when source dimensions drift', async () => {
  vi.useFakeTimers();
  const canvasStream = createTrackedStream({ frameRate: 30, height: 1304, width: 2560 });
  const canvasTrack = canvasStream.track;
  const sourceStream = createSourceStream();
  const { canvas, ctx } = installCanvasFixture(canvasStream);
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 1304, videoWidth: 2560 };

  createSourceVideoMock.mockReturnValue(video);

  const result = await createFixedVideoOutputStream(sourceStream, createSettings());
  video.videoHeight = 1192;
  vi.advanceTimersToNextTimer();

  expect(result.stream).toBe(canvasStream);
  expect(result.dimensions).toEqual({ height: 1304, width: 2560 });
  expect(canvas.width).toBe(2560);
  expect(canvas.height).toBe(1304);
  expect(canvas.captureStream).toHaveBeenCalledWith(30);
  expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
  expect(ctx.imageSmoothingEnabled).toBe(false);
  expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 2560, 1192, 0, 56, 2560, 1192);
  canvasTrack.stop();
  canvasTrack.stop();
  expect(sourceStream.track.stop).toHaveBeenCalledOnce();
  expect(video.pause).toHaveBeenCalled();
});

it('uses one timed canvas track at the requested capped cadence and content hint', async () => {
  const timedStream = createTrackedStream({ frameRate: 24 });
  const timedTrack = timedStream.track;
  const sourceStream = createSourceStream();
  const { canvas } = installCanvasFixture(timedStream);
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };

  createSourceVideoMock.mockReturnValue(video);

  const result = await createFixedVideoOutputStream(sourceStream, createSettings(), {
    contentHint: 'motion',
    frameRate: 24,
  });

  expect(result.stream).toBe(timedStream);
  expect(canvas.captureStream).toHaveBeenCalledOnce();
  expect(canvas.captureStream).toHaveBeenCalledWith(24);
  expect(timedTrack.contentHint).toBe('motion');
  timedTrack.stop();
  expect(sourceStream.track.stop).toHaveBeenCalled();
});

it('cleans up the source stream when fixed canvas creation fails', async () => {
  const sourceStream = createSourceStream();
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };

  createSourceVideoMock.mockReturnValue(video);
  installBrokenCanvasFixture({ stream: createEmptyStream(), withContext: false });

  await expect(createFixedVideoOutputStream(sourceStream, createSettings())).rejects.toThrow(
    'canvas context'
  );

  expect(sourceStream.track.stop).toHaveBeenCalled();
  expect(video.pause).toHaveBeenCalled();
  expect(video.srcObject).toBeNull();
});

it('rejects canvas streams without a video track', async () => {
  const sourceStream = createSourceStream();
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };
  const canvasStream = createEmptyStream();

  createSourceVideoMock.mockReturnValue(video);
  installBrokenCanvasFixture({ stream: canvasStream, withContext: true });

  await expect(createFixedVideoOutputStream(sourceStream, createSettings())).rejects.toThrow(
    'no video track'
  );
});

it('normalizes an arbitrary source to the selected short edge without distortion', async () => {
  vi.useFakeTimers();
  const canvasStream = createStream(2346, 1080);
  const canvasTrack = Object.assign(canvasStream.getVideoTracks()[0]!, {
    requestFrame: vi.fn(),
  });
  const sourceStream = createSourceStream();
  const { canvas, ctx } = installCanvasFixture(canvasStream);
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 500, videoWidth: 1086 };
  createSourceVideoMock.mockReturnValue(video);

  const result = await createFixedVideoOutputStream(
    sourceStream,
    createSettings(VideoResolutionPreset.P1080)
  );

  expect(result.dimensions).toEqual({ height: 1080, width: 2346 });
  expect(canvas).toEqual(expect.objectContaining({ height: 1080, width: 2346 }));
  expect(ctx.drawImage.mock.calls[0]?.slice(1)).toEqual([
    0,
    0,
    1086,
    500,
    expect.closeTo((2346 - (1086 * 1080) / 500) / 2),
    0,
    expect.closeTo((1086 * 1080) / 500),
    1080,
  ]);
  canvasTrack.stop();
});
