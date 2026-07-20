// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  createRecordingVideoElementMock,
  createViewportPresetCanvasMock,
  createViewportPresetCropUpdaterMock,
  createViewportPresetDrawStateUpdaterMock,
  createViewportPresetFrameDrawerMock,
  resolveCanvasCropGeometryMock,
  startCanvasBackedFrameLoopMock,
  waitForVideoReadyMock,
  wrapCanvasTrackStopMock,
} = vi.hoisted(() => ({
  createRecordingVideoElementMock: vi.fn(),
  createViewportPresetCanvasMock: vi.fn(),
  createViewportPresetCropUpdaterMock: vi.fn(),
  createViewportPresetDrawStateUpdaterMock: vi.fn(),
  createViewportPresetFrameDrawerMock: vi.fn(),
  resolveCanvasCropGeometryMock: vi.fn(),
  startCanvasBackedFrameLoopMock: vi.fn(() => vi.fn()),
  waitForVideoReadyMock: vi.fn(),
  wrapCanvasTrackStopMock: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveCanvasCropGeometry: resolveCanvasCropGeometryMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  resolveCanvasCropGeometryMock.mockReturnValue({
    sourceHeight: 40,
    sourceWidth: 30,
    sourceX: 10,
    sourceY: 20,
    targetHeight: 40,
    targetWidth: 30,
  });
  waitForVideoReadyMock.mockResolvedValue(undefined);
  createRecordingVideoElementMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: { stream: true },
    videoHeight: 720,
    videoWidth: 1280,
  } as never);
});

it('omits viewport crop sizing when canvas crop uses the source video dimensions directly', async () => {
  const canvas = {
    captureStream: vi.fn(() => ({
      addTrack: vi.fn(),
      getVideoTracks: () => [{} as MediaStreamTrack],
    })),
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

  await applyCanvasCrop(
    { getAudioTracks: () => [] } as never,
    { height: 40, width: 30, x: 10, y: 20 },
    VideoQuality.HIGH
  );

  expect(resolveCanvasCropGeometryMock).toHaveBeenCalledWith({
    cropRegion: { height: 40, width: 30, x: 10, y: 20 },
    sourceSize: { height: 720, width: 1280 },
  });
});

it('omits viewport preset sizing when the preset stream uses the target resolution directly', async () => {
  createViewportPresetCanvasMock.mockReturnValue({
    canvas: {
      captureStream: vi.fn(() => ({
        addTrack: vi.fn(),
        getVideoTracks: () => [{} as MediaStreamTrack],
      })),
      height: 720,
      width: 1280,
    },
    ctx: { clearRect: vi.fn(), drawImage: vi.fn() },
    state: { drawFrozen: false },
  });
  createViewportPresetCropUpdaterMock.mockReturnValue(vi.fn());
  createViewportPresetDrawStateUpdaterMock.mockReturnValue(vi.fn());
  createViewportPresetFrameDrawerMock.mockReturnValue(vi.fn());

  await createViewportPresetStream(
    { getAudioTracks: () => [] } as never,
    { height: 720, width: 1280 },
    VideoQuality.HIGH
  );

  expect(createViewportPresetCanvasMock).toHaveBeenCalledWith(
    expect.objectContaining({ videoHeight: 720, videoWidth: 1280 }),
    { height: 720, width: 1280 }
  );
});
