// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { createRecordingVideoElementMock, waitForVideoReadyMock, wrapCanvasTrackStopMock } =
  vi.hoisted(() => ({
    createRecordingVideoElementMock: vi.fn(),
    waitForVideoReadyMock: vi.fn(),
    wrapCanvasTrackStopMock: vi.fn((track: MediaStreamTrack, cleanup: () => void) => {
      Object.assign(track, { cleanup });
    }),
  }));

vi.mock('../stream/viewport/video', () => ({
  createRecordingVideoElement: createRecordingVideoElementMock,
  startCanvasBackedFrameLoop: vi.fn(),
  startVideoBackedFrameLoop: vi.fn(),
  waitForVideoReady: waitForVideoReadyMock,
  wrapCanvasTrackStop: wrapCanvasTrackStopMock,
}));

import { normalizeMultiSourceVideoStream } from './normalize';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

function createSourceStream() {
  const track = {
    getSettings: () => ({ height: 1304, width: 2560 }),
    stop: vi.fn(),
  };
  return {
    getAudioTracks: () => [],
    getTracks: () => [track],
    getVideoTracks: () => [track],
    track,
  } as unknown as MediaStream & { track: { stop: ReturnType<typeof vi.fn> } };
}

function installCanvasFixture(stream: MediaStream) {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    set fillStyle(_value: string) {},
  };
  const canvas = {
    captureStream: vi.fn(() => stream),
    getContext: vi.fn(() => ctx),
    height: 0,
    width: 0,
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as never);
  return { canvas, ctx };
}

function installBrokenCanvasFixture(params: { stream: MediaStream; withContext: boolean }) {
  const canvas = {
    captureStream: vi.fn(() => params.stream),
    getContext: vi.fn(() => (params.withContext ? { clearRect: vi.fn() } : null)),
    height: 0,
    width: 0,
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as never);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  waitForVideoReadyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

it('records multi-source video through a fixed-size canvas when source dimensions drift', async () => {
  vi.useFakeTimers();
  const requestFrame = vi.fn();
  const canvasTrack = {
    getSettings: () => ({ height: 1304, width: 2560 }),
    requestFrame,
    stop: vi.fn(),
  };
  const canvasStream = {
    getTracks: () => [canvasTrack],
    getVideoTracks: () => [canvasTrack],
  } as unknown as MediaStream;
  const sourceStream = createSourceStream();
  const { canvas, ctx } = installCanvasFixture(canvasStream);
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 1304, videoWidth: 2560 };

  createRecordingVideoElementMock.mockReturnValue(video);

  const result = await normalizeMultiSourceVideoStream(sourceStream, VideoQuality.HIGH);
  video.videoHeight = 1192;
  vi.advanceTimersToNextTimer();

  expect(result.stream).toBe(canvasStream);
  expect(result.dimensions).toEqual({ height: 1304, width: 2560 });
  expect(canvas.width).toBe(2560);
  expect(canvas.height).toBe(1304);
  expect(canvas.captureStream).toHaveBeenCalledWith(0);
  expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
  expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 0, 0);
  expect(requestFrame).toHaveBeenCalledTimes(2);
  expect(wrapCanvasTrackStopMock).toHaveBeenCalledWith(canvasTrack, expect.any(Function));

  (canvasTrack as unknown as { cleanup: () => void }).cleanup();
  expect(sourceStream.track.stop).toHaveBeenCalled();
  expect(video.pause).toHaveBeenCalled();
});

it('falls back to timed canvas capture when manual frame requests are unavailable', async () => {
  const manualTrack = { getSettings: () => ({}), stop: vi.fn() };
  const timedTrack = { getSettings: () => ({}), stop: vi.fn() };
  const manualStream = { getTracks: () => [manualTrack], getVideoTracks: () => [manualTrack] };
  const timedStream = { getTracks: () => [timedTrack], getVideoTracks: () => [timedTrack] };
  const sourceStream = createSourceStream();
  const { canvas } = installCanvasFixture(timedStream as unknown as MediaStream);
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };

  canvas.captureStream
    .mockReturnValueOnce(manualStream as unknown as MediaStream)
    .mockReturnValueOnce(timedStream as unknown as MediaStream);
  createRecordingVideoElementMock.mockReturnValue(video);

  const result = await normalizeMultiSourceVideoStream(sourceStream, VideoQuality.HIGH);

  expect(result.stream).toBe(timedStream);
  expect(manualTrack.stop).toHaveBeenCalled();
  expect(wrapCanvasTrackStopMock).toHaveBeenCalledWith(timedTrack, expect.any(Function));
});

it('cleans up the source stream when fixed canvas creation fails', async () => {
  const sourceStream = createSourceStream();
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };

  createRecordingVideoElementMock.mockReturnValue(video);
  installBrokenCanvasFixture({ stream: {} as MediaStream, withContext: false });

  await expect(normalizeMultiSourceVideoStream(sourceStream, VideoQuality.HIGH)).rejects.toThrow(
    'canvas context'
  );

  expect(sourceStream.track.stop).toHaveBeenCalled();
  expect(video.pause).toHaveBeenCalled();
  expect(video.srcObject).toBeNull();
});

it('rejects canvas streams without a video track', async () => {
  const sourceStream = createSourceStream();
  const video = { pause: vi.fn(), srcObject: sourceStream, videoHeight: 720, videoWidth: 1280 };
  const canvasStream = { getVideoTracks: () => [] } as unknown as MediaStream;

  createRecordingVideoElementMock.mockReturnValue(video);
  installBrokenCanvasFixture({ stream: canvasStream, withContext: true });

  await expect(normalizeMultiSourceVideoStream(sourceStream, VideoQuality.HIGH)).rejects.toThrow(
    'no video track'
  );
});
