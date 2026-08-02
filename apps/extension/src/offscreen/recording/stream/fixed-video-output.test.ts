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

import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createAudioStream,
  createEmptyStream,
  createStream,
  createTrackedStream,
} from '../multi-source/media-stream.test-support';
import { createFixedVideoOutputStream } from './fixed-video-output';

function createSettings(resolution: VideoResolutionPreset = VideoResolutionPreset.SOURCE) {
  return {
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, resolution },
  };
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  waitForSourceMetadataMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('contains a changed window source inside its immutable SOURCE canvas', async () => {
  const canvasStream = createTrackedStream({ frameRate: 30, height: 1304, width: 2560 });
  const sourceStream = createTrackedStream({ height: 1304, width: 2560 });
  const { canvas, ctx } = installCanvasFixture(canvasStream);
  const video = {
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 1304,
    videoWidth: 2560,
  };
  createSourceVideoMock.mockReturnValue(video);

  const result = await createFixedVideoOutputStream(sourceStream, createSettings());
  expect(canvas.captureStream).toHaveBeenCalledOnce();
  video.videoHeight = 1192;
  vi.advanceTimersToNextTimer();

  expect(result.dimensions).toEqual({ height: 1304, width: 2560 });
  expect(canvas).toEqual(expect.objectContaining({ height: 1304, width: 2560 }));
  expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 2560, 1192, 0, 56, 2560, 1192);
  expect(canvas.captureStream).toHaveBeenCalledOnce();
  canvasStream.track.stop();
  canvasStream.track.stop();
  expect(sourceStream.track.stop).toHaveBeenCalledOnce();
  expect(video.pause).toHaveBeenCalledOnce();
});

it('preserves primary source-audio ownership only when explicitly requested', async () => {
  const canvasStream = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const sourceStream = createTrackedStream({ height: 720, width: 1280 });
  const audioTrack = createAudioStream().getAudioTracks()[0]!;
  vi.spyOn(sourceStream, 'getAudioTracks').mockReturnValue([audioTrack]);
  const addTrack = vi.spyOn(canvasStream, 'addTrack');
  installCanvasFixture(canvasStream);
  createSourceVideoMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 720,
    videoWidth: 1280,
  });

  await createFixedVideoOutputStream(sourceStream, createSettings(), {
    includeSourceAudio: true,
    sourceOwnership: 'caller',
  });

  expect(addTrack).toHaveBeenCalledWith(audioTrack);
  canvasStream.track.stop();
  expect(sourceStream.track.stop).not.toHaveBeenCalled();
});

it('uses exact preset height and proportional even width', async () => {
  const canvasStream = createStream(2346, 1080);
  const sourceStream = createTrackedStream({ height: 500, width: 1086 });
  const { canvas, ctx } = installCanvasFixture(canvasStream);
  const video = {
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 500,
    videoWidth: 1086,
  };
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
  canvasStream.getVideoTracks()[0]?.stop();
});

it('caps an adapter cadence at the selected profile frame rate', async () => {
  const canvasStream = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const sourceStream = createTrackedStream({ height: 720, width: 1280 });
  const { canvas } = installCanvasFixture(canvasStream);
  createSourceVideoMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 720,
    videoWidth: 1280,
  });

  const result = await createFixedVideoOutputStream(sourceStream, createSettings(), {
    frameRate: 60,
  });

  expect(result.frameRate).toBe(30);
  expect(canvas.captureStream).toHaveBeenCalledWith(30);
  canvasStream.track.stop();
});

it('caps the fixed cadence once at the source track rate reported on start', async () => {
  const canvasStream = createTrackedStream({ frameRate: 24, height: 720, width: 1280 });
  const sourceStream = createTrackedStream({ frameRate: 24, height: 720, width: 1280 });
  const { canvas } = installCanvasFixture(canvasStream);
  createSourceVideoMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 720,
    videoWidth: 1280,
  });

  const result = await createFixedVideoOutputStream(sourceStream, createSettings());

  expect(result.frameRate).toBe(24);
  expect(canvas.captureStream).toHaveBeenCalledWith(24);
  canvasStream.track.stop();
});

it('cleans up the source when canvas output creation fails', async () => {
  const sourceStream = createTrackedStream({ height: 720, width: 1280 });
  const video = {
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 720,
    videoWidth: 1280,
  };
  createSourceVideoMock.mockReturnValue(video);
  const canvas = Object.assign(document.createElement('canvas'), {
    captureStream: vi.fn(() => createEmptyStream()),
    getContext: vi.fn(() => null),
  });
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);

  await expect(createFixedVideoOutputStream(sourceStream, createSettings())).rejects.toThrow(
    'canvas context'
  );
  expect(sourceStream.track.stop).toHaveBeenCalledOnce();
  expect(video.pause).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
});
