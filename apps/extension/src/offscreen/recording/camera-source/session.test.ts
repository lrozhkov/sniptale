// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { TestMediaStream, createTrackedStream } from '../multi-source/media-stream.test-support';

const { createCanvasVideoOutputMock } = vi.hoisted(() => ({
  createCanvasVideoOutputMock: vi.fn(),
}));

vi.mock('../stream/canvas-video-output', () => ({
  createCanvasVideoOutput: createCanvasVideoOutputMock,
}));

import { createCameraSourceOwner } from './session';

function createVideo(width = 1280, height = 720) {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: height },
    videoWidth: { configurable: true, value: width },
  });
  vi.spyOn(video, 'pause').mockImplementation(() => undefined);
  return video;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaStream', TestMediaStream);
});

it('shares one stable normalized output while leases own independent clones', async () => {
  const raw = createTrackedStream({ frameRate: 60, height: 720, width: 1280 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(output);
  const acquireRawStream = vi.fn().mockResolvedValue(raw);
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });

  const first = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });
  const second = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });

  expect(acquireRawStream).toHaveBeenCalledOnce();
  expect(createCanvasVideoOutputMock).toHaveBeenCalledOnce();
  const drawingOptions = createCanvasVideoOutputMock.mock.calls[0]?.[0];
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  const drawing = drawingOptions.initializeDrawing({
    canvas: { height: 1080, width: 1920 },
    context,
  });
  expect(drawing.drawLiveFrame()).toBe(true);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(first.stream.getVideoTracks()[0]).not.toBe(second.stream.getVideoTracks()[0]);
  expect(first.trackSettings).toEqual({ frameRate: 30, height: 1080, width: 1920 });
  first.release();
  expect(raw.track.stop).not.toHaveBeenCalled();
  second.release();
  expect(raw.track.stop).toHaveBeenCalledOnce();
  expect(output.track.stop).toHaveBeenCalledOnce();
});

it('rejects malformed raw and normalized sources and cleans partial initialization', async () => {
  const noRawTrack = new TestMediaStream([]);
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(noRawTrack),
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  await expect(owner.acquire(DEFAULT_VIDEO_SETTINGS)).rejects.toThrow('missing a video track');

  const raw = createTrackedStream();
  createCanvasVideoOutputMock.mockReturnValueOnce(new TestMediaStream([]));
  const normalizedOwner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(raw),
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  await expect(normalizedOwner.acquire(DEFAULT_VIDEO_SETTINGS)).rejects.toThrow(
    'Normalized camera source is missing a video track'
  );
});

it('supersedes pending initialization and rejects switching without an active source', async () => {
  const raw = createTrackedStream();
  let resolveMetadata!: () => void;
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(raw),
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn(() => new Promise<void>((resolve) => (resolveMetadata = resolve))),
  });
  const pending = owner.acquire(DEFAULT_VIDEO_SETTINGS);
  await vi.waitFor(() => expect(resolveMetadata).toBeTypeOf('function'));
  owner.close();
  resolveMetadata();
  await expect(pending).rejects.toThrow('superseded');
  expect(owner.hasActiveSource()).toBe(false);
  await expect(owner.switchInput(null)).rejects.toThrow('not active');
  owner.setEnabled(false);
});

it('atomically swaps the raw input without replacing an acquired output track', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(output);
  const acquireRawStream = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(replacement);
  const videos = [createVideo(), createVideo(1920, 1080)];
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => videos.shift()!,
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  const lease = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });
  const stableTrack = lease.stream.getVideoTracks()[0];

  await owner.switchInput('replacement-camera');

  expect(initial.track.stop).toHaveBeenCalledOnce();
  expect(replacement.track.stop).not.toHaveBeenCalled();
  expect(lease.stream.getVideoTracks()[0]).toBe(stableTrack);
  expect(acquireRawStream).toHaveBeenLastCalledWith({
    audio: false,
    video: expect.objectContaining({ deviceId: { exact: 'replacement-camera' } }),
  });
  lease.release();
  expect(replacement.track.stop).toHaveBeenCalledOnce();
});

it('rolls back a replacement that fails metadata validation', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  createCanvasVideoOutputMock.mockReturnValue(
    createTrackedStream({ frameRate: 30, height: 720, width: 1280 })
  );
  const waitForMetadata = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('metadata failed'));
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(replacement),
    createVideo: () => createVideo(),
    waitForMetadata,
  });
  const lease = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });

  await expect(owner.switchInput('broken')).rejects.toThrow('metadata failed');

  expect(initial.track.stop).not.toHaveBeenCalled();
  expect(replacement.track.stop).toHaveBeenCalledOnce();
  lease.release();
});

it('applies enabled state to every live lease and closes idempotently', async () => {
  const raw = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(output);
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(raw),
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  const lease = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });

  owner.setEnabled(false);
  expect(raw.track.enabled).toBe(false);
  expect(lease.stream.getVideoTracks()[0]?.enabled).toBe(false);
  owner.close();
  owner.close();
  lease.release();

  expect(raw.track.stop).toHaveBeenCalledOnce();
  expect(output.track.stop).toHaveBeenCalledOnce();
});
