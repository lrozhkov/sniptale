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
  createRecordingVideoElementMock.mockReturnValue(createVideoFixture());
  waitForVideoReadyMock.mockResolvedValue(undefined);
});

it('falls back to the high quality frame rate when crop quality is invalid and no requestFrame exists', async () => {
  const manualTrack = { stop: vi.fn() };
  const croppedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const manualStream = {
    getVideoTracks: () => [manualTrack as unknown as MediaStreamTrack],
  } as unknown as MediaStream;
  const canvas = {
    captureStream: vi.fn((frameRate: number) => (frameRate === 0 ? manualStream : croppedStream)),
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    height: 0,
    width: 0,
  };
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as never;
    }

    return originalCreateElement(tagName);
  });

  await expect(
    applyCanvasCrop(
      createSourceStream(),
      { x: 10, y: 20, width: 300, height: 200 },
      'BROKEN' as never
    )
  ).resolves.toBe(croppedStream);

  expect(canvas.captureStream).toHaveBeenNthCalledWith(1, 0);
  expect(canvas.captureStream).toHaveBeenNthCalledWith(2, 30);
  expect(manualTrack.stop).toHaveBeenCalledOnce();
});

it('falls back to the high quality frame rate when preset quality is invalid and no requestFrame exists', async () => {
  const manualTrack = { stop: vi.fn() };
  const presetStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const manualStream = {
    getVideoTracks: () => [manualTrack as unknown as MediaStreamTrack],
  } as unknown as MediaStream;
  const captureStream = vi.fn((frameRate: number) =>
    frameRate === 0 ? manualStream : presetStream
  );

  createViewportPresetCanvasMock.mockReturnValue({
    canvas: {
      captureStream,
      height: 720,
      width: 1280,
    },
    ctx: { clearRect: vi.fn(), drawImage: vi.fn() },
    state: { drawFrozen: false },
  });
  createViewportPresetFrameDrawerMock.mockReturnValue(vi.fn());
  createViewportPresetCropUpdaterMock.mockReturnValue(vi.fn());
  createViewportPresetDrawStateUpdaterMock.mockReturnValue(vi.fn());

  await expect(
    createViewportPresetStream(
      createSourceStream(),
      { width: 1280, height: 720 },
      'BROKEN' as never
    )
  ).resolves.toEqual({
    stream: presetStream,
    updateCrop: expect.any(Function),
    updateDrawState: expect.any(Function),
  });

  expect(captureStream).toHaveBeenNthCalledWith(1, 0);
  expect(captureStream).toHaveBeenNthCalledWith(2, 30);
  expect(manualTrack.stop).toHaveBeenCalledOnce();
});
