// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  createRecordingVideoElementMock,
  createViewportPresetCanvasMock,
  createViewportPresetCropUpdaterMock,
  createViewportPresetDrawStateUpdaterMock,
  createViewportPresetFrameDrawerMock,
  startCanvasBackedFrameLoopMock,
  waitForVideoReadyMock,
} = vi.hoisted(() => ({
  createRecordingVideoElementMock: vi.fn(),
  createViewportPresetCanvasMock: vi.fn(),
  createViewportPresetCropUpdaterMock: vi.fn(),
  createViewportPresetDrawStateUpdaterMock: vi.fn(),
  createViewportPresetFrameDrawerMock: vi.fn(),
  startCanvasBackedFrameLoopMock: vi.fn(),
  waitForVideoReadyMock: vi.fn(),
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
  wrapCanvasTrackStop: vi.fn(),
}));

import { applyCanvasCrop, createViewportPresetStream } from '.';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

function createCanvasFixture(stream: MediaStream) {
  return {
    canvas: {
      width: 0,
      height: 0,
      captureStream: vi.fn(() => stream),
      getContext: vi.fn(() => ({ clearRect: vi.fn(), drawImage: vi.fn() })),
    },
  };
}

function createSourceStream() {
  return {
    getAudioTracks: () => [{ id: 'audio-track' }],
  } as unknown as MediaStream;
}

function createVideoFixture() {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    pause: vi.fn(),
    srcObject: { stream: true },
  } as unknown as HTMLVideoElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  startCanvasBackedFrameLoopMock.mockImplementation((_frameRate, drawFrame) => {
    drawFrame();
    return vi.fn();
  });
});

it('requests canvas frames and supports omitted viewport preset sizing', async () => {
  const requestFrame = vi.fn();
  const croppedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{ requestFrame } as unknown as MediaStreamTrack],
  } as unknown as MediaStream;

  const cropCanvas = prepareCanvasCrop(croppedStream);

  await applyCanvasCrop(
    createSourceStream(),
    { x: 10, y: 20, width: 300, height: 200 },
    VideoQuality.HIGH
  );

  expect(cropCanvas.captureStream).toHaveBeenCalledWith(0);
  expect(requestFrame).toHaveBeenCalled();

  prepareViewportPresetStream(croppedStream);

  await createViewportPresetStream(
    createSourceStream(),
    { width: 1280, height: 720 },
    VideoQuality.HIGH
  );

  expect(createViewportPresetCanvasMock).toHaveBeenCalledWith(
    expect.objectContaining({ videoHeight: 720, videoWidth: 1280 }),
    { width: 1280, height: 720 }
  );
});

function prepareCanvasCrop(croppedStream: MediaStream) {
  const { canvas } = createCanvasFixture(croppedStream);
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as never;
    }

    return originalCreateElement(tagName);
  });
  createRecordingVideoElementMock.mockReturnValue(createVideoFixture());
  waitForVideoReadyMock.mockResolvedValue(undefined);
  return canvas;
}

function prepareViewportPresetStream(croppedStream: MediaStream): void {
  createViewportPresetCanvasMock.mockReturnValue({
    canvas: {
      captureStream: vi.fn(() => croppedStream),
      height: 720,
      width: 1280,
    },
    ctx: { clearRect: vi.fn(), drawImage: vi.fn() },
    state: { drawFrozen: false },
  });
  createViewportPresetFrameDrawerMock.mockReturnValue(vi.fn());
  createViewportPresetCropUpdaterMock.mockReturnValue(vi.fn());
  createViewportPresetDrawStateUpdaterMock.mockReturnValue(vi.fn());
}
