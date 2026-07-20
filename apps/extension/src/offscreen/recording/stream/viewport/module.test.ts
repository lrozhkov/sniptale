// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createRecordingVideoElementMock,
  createViewportPresetCanvasMock,
  createViewportPresetCropUpdaterMock,
  createViewportPresetDrawStateUpdaterMock,
  createViewportPresetFrameDrawerMock,
  startCanvasBackedFrameLoopMock,
  waitForVideoReadyMock,
  wrapCanvasTrackStopMock,
} = vi.hoisted(() => ({
  createRecordingVideoElementMock: vi.fn(),
  createViewportPresetCanvasMock: vi.fn(),
  createViewportPresetCropUpdaterMock: vi.fn(),
  createViewportPresetDrawStateUpdaterMock: vi.fn(),
  createViewportPresetFrameDrawerMock: vi.fn(),
  startCanvasBackedFrameLoopMock: vi.fn(),
  waitForVideoReadyMock: vi.fn(),
  wrapCanvasTrackStopMock: vi.fn(),
}));

vi.mock('./runtime', () => ({
  createViewportPresetCanvas: createViewportPresetCanvasMock,
  createViewportPresetCropUpdater: createViewportPresetCropUpdaterMock,
  createViewportPresetDrawStateUpdater: createViewportPresetDrawStateUpdaterMock,
  createViewportPresetFrameDrawer: createViewportPresetFrameDrawerMock,
}));

vi.mock('./video', () => ({
  createRecordingVideoElement: createRecordingVideoElementMock,
  startCanvasBackedFrameLoop: startCanvasBackedFrameLoopMock,
  startVideoBackedFrameLoop: vi.fn(),
  waitForVideoReady: waitForVideoReadyMock,
  wrapCanvasTrackStop: wrapCanvasTrackStopMock,
}));

import { applyCanvasCrop, createViewportPresetStream } from '.';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

type QueuedFrameLoop = {
  cleanup: () => void;
  drawFrame: () => void;
};

const frameLoopState = vi.hoisted(() => ({
  queuedLoops: [] as QueuedFrameLoop[],
}));

function createCanvasFixture(stream: MediaStream) {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    captureStream: vi.fn(() => stream),
    getContext: vi.fn(() => ctx),
  };

  return { canvas, ctx };
}

function createSourceStream(audioTrack = { id: 'audio-track' }) {
  return {
    getAudioTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

function createVideoFixture(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    pause: vi.fn(),
    srcObject: { stream: true },
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function resetViewportModuleMocks() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    frameLoopState.queuedLoops.length = 0;
    startCanvasBackedFrameLoopMock.mockImplementation((_frameRate, drawFrame) => {
      const cleanup = vi.fn();
      frameLoopState.queuedLoops.push({ cleanup, drawFrame });
      return cleanup;
    });
  });
}

async function verifiesCanvasCropLoopCleanup() {
  const stopLoop = { current: null as null | (() => void) };
  const croppedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const { canvas, ctx } = createCanvasFixture(croppedStream);
  const video = createVideoFixture();
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as never;
    }

    return originalCreateElement(tagName);
  });

  createRecordingVideoElementMock.mockReturnValue(video);
  waitForVideoReadyMock.mockResolvedValue(undefined);
  wrapCanvasTrackStopMock.mockImplementation((_track: MediaStreamTrack, cleanup: () => void) => {
    stopLoop.current = cleanup;
  });

  const result = await applyCanvasCrop(
    createSourceStream(),
    { x: 10, y: 20, width: 300, height: 200 },
    VideoQuality.HIGH
  );
  const [queuedLoop] = frameLoopState.queuedLoops;

  expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  queuedLoop?.drawFrame();
  stopLoop.current?.();

  expect(result).toBe(croppedStream);
  expect(croppedStream.addTrack).toHaveBeenCalledWith({ id: 'audio-track' });
  expect(canvas.captureStream).toHaveBeenCalled();
  expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  expect(ctx.drawImage).toHaveBeenCalledWith(video, 10, 20, 300, 200, 0, 0, 300, 200);
  expect(queuedLoop?.cleanup).toHaveBeenCalledOnce();
  expect(video.pause).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
}

async function verifiesCanvasCropScalesDevicePixelRegionIntoSourceGeometry() {
  const croppedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const { canvas, ctx } = createCanvasFixture(croppedStream);
  const video = createVideoFixture({
    videoWidth: 640,
    videoHeight: 360,
  });
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as never;
    }

    return originalCreateElement(tagName);
  });

  createRecordingVideoElementMock.mockReturnValue(video);
  waitForVideoReadyMock.mockResolvedValue(undefined);

  await applyCanvasCrop(
    createSourceStream(),
    { x: 100, y: 50, width: 400, height: 200 },
    VideoQuality.HIGH,
    { width: 1280, height: 720 }
  );

  expect(canvas.width).toBe(200);
  expect(canvas.height).toBe(100);
  expect(ctx.drawImage).toHaveBeenCalledWith(video, 50, 25, 200, 100, 0, 0, 200, 100);
}

async function verifiesCanvasCropDimensionGuard() {
  createRecordingVideoElementMock.mockReturnValue(
    createVideoFixture({
      videoWidth: 0,
      videoHeight: 0,
    })
  );
  waitForVideoReadyMock.mockResolvedValue(undefined);

  await expect(
    applyCanvasCrop(createSourceStream(), { x: 0, y: 0, width: 10, height: 10 }, VideoQuality.HIGH)
  ).rejects.toThrow('Video has no dimensions: 0x0');
}

async function verifiesViewportPresetStreamLifecycle() {
  const stopLoop = { current: null as null | (() => void) };
  const presetStream = createPresetStreamFixture();
  const video = createVideoFixture();
  const drawFrame = vi.fn();
  const updateCrop = vi.fn();
  const updateDrawState = vi.fn();

  createRecordingVideoElementMock.mockReturnValue(video);
  waitForVideoReadyMock.mockResolvedValue(undefined);
  createViewportPresetCanvasMock.mockReturnValue({
    canvas: {
      captureStream: vi.fn(() => presetStream),
      height: 720,
      width: 1280,
    },
    ctx: { clearRect: vi.fn(), drawImage: vi.fn() },
    state: { drawFrozen: false },
  });
  createViewportPresetFrameDrawerMock.mockReturnValue(drawFrame);
  createViewportPresetCropUpdaterMock.mockReturnValue(updateCrop);
  createViewportPresetDrawStateUpdaterMock.mockReturnValue(updateDrawState);
  wrapCanvasTrackStopMock.mockImplementation((_track: MediaStreamTrack, cleanup: () => void) => {
    stopLoop.current = cleanup;
  });

  const result = await createViewportPresetStream(
    createSourceStream(),
    { width: 1280, height: 720 },
    VideoQuality.HIGH,
    { width: 960, height: 540 }
  );
  const [queuedLoop] = frameLoopState.queuedLoops;

  queuedLoop?.drawFrame();
  stopLoop.current?.();

  expect(result).toEqual({
    stream: presetStream,
    updateCrop,
    updateDrawState,
  });
  expect(drawFrame).toHaveBeenCalledTimes(2);
  expect(queuedLoop?.cleanup).toHaveBeenCalledOnce();
  expect(presetStream.addTrack).toHaveBeenCalledWith({ id: 'audio-track' });
  expect(video.pause).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
}

function createPresetStreamFixture() {
  return {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
}

async function verifiesViewportPresetDimensionGuard() {
  createRecordingVideoElementMock.mockReturnValue(
    createVideoFixture({
      videoWidth: 0,
      videoHeight: 0,
    })
  );
  waitForVideoReadyMock.mockResolvedValue(undefined);

  await expect(
    createViewportPresetStream(
      createSourceStream(),
      { width: 1920, height: 1080 },
      VideoQuality.HIGH
    )
  ).rejects.toThrow('Viewport preset video has no dimensions: 0x0');
}

function runViewportModuleSuite() {
  resetViewportModuleMocks();

  it(
    'builds a cropped canvas stream and tears down its loop on track stop',
    verifiesCanvasCropLoopCleanup
  );
  it(
    'rejects cropped stream setup when the source video has no dimensions',
    verifiesCanvasCropDimensionGuard
  );
  it(
    'scales tab-crop device-pixel regions into the actual source-video geometry',
    verifiesCanvasCropScalesDevicePixelRegionIntoSourceGeometry
  );
  it(
    'creates a viewport preset stream, returns owner updaters, and stops the frame loop',
    verifiesViewportPresetStreamLifecycle
  );
  it(
    'rejects viewport preset setup when the source video has no dimensions',
    verifiesViewportPresetDimensionGuard
  );
}

describe('offscreen-recording-stream.viewport module', runViewportModuleSuite);
