// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  createRecordingVideoElementMock,
  startCanvasBackedFrameLoopMock,
  waitForVideoReadyMock,
  wrapCanvasTrackStopMock,
} = vi.hoisted(() => ({
  createRecordingVideoElementMock: vi.fn(),
  startCanvasBackedFrameLoopMock: vi.fn(() => vi.fn()),
  waitForVideoReadyMock: vi.fn(),
  wrapCanvasTrackStopMock: vi.fn(),
}));

vi.mock('./runtime', () => ({
  createViewportPresetCanvas: vi.fn(),
  createViewportPresetCropUpdater: vi.fn(),
  createViewportPresetDrawStateUpdater: vi.fn(),
  createViewportPresetFrameDrawer: vi.fn(),
}));

vi.mock('./video', () => ({
  createRecordingVideoElement: createRecordingVideoElementMock,
  startCanvasBackedFrameLoop: startCanvasBackedFrameLoopMock,
  startVideoBackedFrameLoop: vi.fn(),
  waitForVideoReady: waitForVideoReadyMock,
  wrapCanvasTrackStop: wrapCanvasTrackStopMock,
}));

import { applyCanvasCrop } from '.';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

beforeEach(() => {
  vi.clearAllMocks();
});

it('skips audio attachment when a cropped source stream has no audio tracks', async () => {
  const croppedStream = {
    addTrack: vi.fn(),
    getVideoTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
  const canvas = {
    captureStream: vi.fn(() => croppedStream),
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
  createRecordingVideoElementMock.mockReturnValue({
    pause: vi.fn(),
    srcObject: { stream: true },
    videoHeight: 720,
    videoWidth: 1280,
  } as never);
  waitForVideoReadyMock.mockResolvedValue(undefined);

  await applyCanvasCrop(
    { getAudioTracks: () => [] } as unknown as MediaStream,
    { height: 100, width: 100, x: 0, y: 0 },
    VideoQuality.HIGH
  );

  expect(croppedStream.addTrack).not.toHaveBeenCalled();
});
