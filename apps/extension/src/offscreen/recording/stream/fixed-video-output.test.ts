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

vi.mock('./frame-pump', async (importOriginal) => {
  const original = await importOriginal<typeof import('./frame-pump')>();
  return {
    ...original,
    startVideoFramePump: vi.fn((options: Parameters<typeof original.startVideoFramePump>[0]) => {
      options.drawLiveFrame();
      const timer = setTimeout(() => options.drawLiveFrame(), 0);
      return () => clearTimeout(timer);
    }),
  };
});

import {
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
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

it.each(Object.values(VideoResolutionPreset))(
  'fills every stable fixed-output canvas edge for %s',
  async (resolution) => {
    const outputSize = resolveVideoOutputDimensions(1086, 500, resolution);
    const canvasStream = createStream(outputSize.width, outputSize.height);
    const sourceStream = createTrackedStream({ height: 500, width: 1086 });
    const { canvas, ctx } = installCanvasFixture(canvasStream);
    const video = {
      pause: vi.fn(),
      srcObject: sourceStream,
      videoHeight: 500,
      videoWidth: 1086,
    };
    createSourceVideoMock.mockReturnValue(video);

    const result = await createFixedVideoOutputStream(sourceStream, createSettings(resolution));

    expect(result.dimensions).toEqual(outputSize);
    expect(canvas).toEqual(expect.objectContaining(outputSize));
    const draw = ctx.drawImage.mock.calls[0]?.slice(1) as number[];
    expect(draw?.slice(4)).toEqual([0, 0, outputSize.width, outputSize.height]);
    expect(draw[2]! / draw[3]!).toBeCloseTo(outputSize.width / outputSize.height, 12);
    expect(draw[0]).toBeGreaterThanOrEqual(0);
    expect(draw[1]).toBeGreaterThanOrEqual(0);
    expect(draw[0]! + draw[2]!).toBeLessThanOrEqual(1086);
    expect(draw[1]! + draw[3]!).toBeLessThanOrEqual(500);
    canvasStream.getVideoTracks()[0]?.stop();
  }
);

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
  expect(canvas.captureStream).toHaveBeenCalledWith(0);
  canvasStream.track.stop();
});

it('rejects a selected fixed cadence that the source cannot provide', async () => {
  const canvasStream = createTrackedStream({ frameRate: 24, height: 720, width: 1280 });
  const sourceStream = createTrackedStream({ frameRate: 24, height: 720, width: 1280 });
  const { canvas } = installCanvasFixture(canvasStream);
  createSourceVideoMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: sourceStream,
    videoHeight: 720,
    videoWidth: 1280,
  });

  await expect(createFixedVideoOutputStream(sourceStream, createSettings())).rejects.toThrow(
    'requested 30 FPS, source provides 24 FPS'
  );

  expect(canvas.captureStream).not.toHaveBeenCalled();
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
