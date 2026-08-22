// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { TestMediaStream, createTrackedStream } from '../multi-source/media-stream.test-support';

const { createCanvasVideoOutputMock } = vi.hoisted(() => ({
  createCanvasVideoOutputMock: vi.fn(),
}));

vi.mock('../stream/canvas-video-output', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream/canvas-video-output')>()),
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

function createCanvasOutput(stream: MediaStream) {
  return { failure: new Promise<never>(() => undefined), stream };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaStream', TestMediaStream);
});

it('shares one stable normalized output while leases own independent clones', async () => {
  const raw = createTrackedStream({ frameRate: 60, height: 720, width: 1280 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(createCanvasOutput(output));
  const acquireRawStream = vi.fn().mockResolvedValue(raw);
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });

  const first = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });
  const second = await owner.acquire({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true });

  expect(acquireRawStream).toHaveBeenCalledOnce();
  expect(acquireRawStream).toHaveBeenCalledWith({
    audio: false,
    video: expect.objectContaining({
      frameRate: { ideal: 30, max: 30 },
      height: { max: 640 },
      width: { ideal: 640, max: 640 },
    }),
  });
  expect(createCanvasVideoOutputMock).toHaveBeenCalledOnce();
  const drawingOptions = createCanvasVideoOutputMock.mock.calls[0]?.[0];
  expect(drawingOptions.sourceVideo).toBeUndefined();
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
  expect(drawingOptions.dimensions).toEqual({ height: 360, width: 640 });
  expect(first.trackSettings).toEqual({ frameRate: 30, height: 360, width: 640 });
  first.release();
  expect(raw.track.stop).not.toHaveBeenCalled();
  second.release();
  expect(raw.track.stop).toHaveBeenCalledOnce();
  expect(output.track.stop).toHaveBeenCalledOnce();
});

it('preserves requested camera dimensions for a separate recording track', async () => {
  const raw = createTrackedStream({ frameRate: 60, height: 1080, width: 1920 });
  createCanvasVideoOutputMock.mockReturnValue(
    createCanvasOutput(createTrackedStream({ frameRate: 60, height: 1080, width: 1920 }))
  );
  const acquireRawStream = vi.fn().mockResolvedValue(raw);
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => createVideo(1920, 1080),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });

  const lease = await owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    webcamEnabled: true,
    webcamPresentation: {
      ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
      mode: 'separate-track',
    },
  });

  expect(createCanvasVideoOutputMock.mock.calls[0]?.[0].dimensions).toEqual({
    height: 1080,
    width: 1920,
  });
  expect(acquireRawStream).toHaveBeenCalledWith({
    audio: false,
    video: expect.not.objectContaining({
      height: { max: 640 },
      width: { ideal: 640, max: 640 },
    }),
  });
  expect(lease.trackSettings).toMatchObject({ height: 1080, width: 1920 });
  lease.release();
});

it('records a separate camera track at its negotiated rate below the main output rate', async () => {
  const raw = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  createCanvasVideoOutputMock.mockReturnValue(
    createCanvasOutput(createTrackedStream({ frameRate: 30, height: 1080, width: 1920 }))
  );
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(raw),
    createVideo: () => createVideo(1920, 1080),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });

  const lease = await owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, frameRate: 60 },
    webcamEnabled: true,
    webcamPresentation: {
      ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
      mode: 'separate-track',
    },
    webcamQuality: {
      frameRate: WebcamFrameRatePreset.FPS60,
      resolution: WebcamResolutionPreset.P1080,
    },
  });

  expect(createCanvasVideoOutputMock).toHaveBeenCalledWith(
    expect.objectContaining({ frameRate: 30 })
  );
  expect(lease.trackSettings).toMatchObject({ frameRate: 30, height: 1080, width: 1920 });
  lease.release();
});

it('rejects malformed raw and normalized sources and cleans partial initialization', async () => {
  const noRawTrack = new TestMediaStream([]);
  const owner = createCameraSourceOwner({
    acquireRawStream: vi.fn().mockResolvedValue(noRawTrack),
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  await expect(owner.acquire(DEFAULT_VIDEO_SETTINGS)).rejects.toThrow('missing a video track');

  const raw = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValueOnce(createCanvasOutput(new TestMediaStream([])));
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

it('queues a device switch behind pending preview initialization', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(
    createCanvasOutput(createTrackedStream({ frameRate: 30, height: 720, width: 1280 }))
  );
  let resolveInitialMetadata!: () => void;
  const waitForMetadata = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveInitialMetadata = resolve))
    )
    .mockResolvedValueOnce(undefined);
  const acquireRawStream = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(replacement);
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => createVideo(),
    waitForMetadata,
  });

  const preview = owner.acquire(DEFAULT_VIDEO_SETTINGS);
  await vi.waitFor(() => expect(resolveInitialMetadata).toBeTypeOf('function'));
  const switching = owner.switchInput('camera-2');
  resolveInitialMetadata();
  const lease = await preview;
  await switching;

  expect(acquireRawStream).toHaveBeenCalledTimes(2);
  expect(acquireRawStream).toHaveBeenLastCalledWith({
    audio: false,
    video: expect.objectContaining({ deviceId: { exact: 'camera-2' } }),
  });
  expect(initial.track.stop).toHaveBeenCalledOnce();
  lease.release();
});

it('supersedes a pending embedded preview before acquiring separate-track quality', async () => {
  const embeddedRaw = createTrackedStream({ frameRate: 30, height: 360, width: 640 });
  const separateRaw = createTrackedStream({ frameRate: 60, height: 1080, width: 1920 });
  createCanvasVideoOutputMock
    .mockReturnValueOnce(
      createCanvasOutput(createTrackedStream({ frameRate: 30, height: 360, width: 640 }))
    )
    .mockReturnValueOnce(
      createCanvasOutput(createTrackedStream({ frameRate: 60, height: 1080, width: 1920 }))
    );
  let resolveEmbeddedMetadata!: () => void;
  const waitForMetadata = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveEmbeddedMetadata = resolve))
    )
    .mockResolvedValueOnce(undefined);
  const acquireRawStream = vi
    .fn()
    .mockResolvedValueOnce(embeddedRaw)
    .mockResolvedValueOnce(separateRaw);
  const videos = [createVideo(640, 360), createVideo(1920, 1080)];
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => videos.shift()!,
    waitForMetadata,
  });
  const embedded = owner.acquire(DEFAULT_VIDEO_SETTINGS);
  await vi.waitFor(() => expect(resolveEmbeddedMetadata).toBeTypeOf('function'));
  const separate = owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, frameRate: 60 },
    webcamPresentation: {
      ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
      mode: 'separate-track',
    },
    webcamQuality: {
      frameRate: WebcamFrameRatePreset.FPS60,
      resolution: WebcamResolutionPreset.P1080,
    },
  });

  resolveEmbeddedMetadata();
  await expect(embedded).rejects.toThrow('superseded');
  const separateLease = await separate;

  expect(acquireRawStream).toHaveBeenCalledTimes(2);
  expect(createCanvasVideoOutputMock).toHaveBeenCalledOnce();
  expect(createCanvasVideoOutputMock.mock.calls[0]?.[0]).toMatchObject({
    dimensions: { height: 1080, width: 1920 },
    frameRate: 60,
  });
  expect(separateLease.trackSettings).toMatchObject({ frameRate: 60, height: 1080, width: 1920 });
  expect(embeddedRaw.track.stop).toHaveBeenCalledOnce();
  separateLease.release();
});

it('atomically swaps the raw input without replacing an acquired output track', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 480, width: 640 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(createCanvasOutput(output));
  const acquireRawStream = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(replacement);
  const videos = [createVideo(), createVideo(640, 480)];
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => videos.shift()!,
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  const lease = await owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    webcamEnabled: true,
    webcamQuality: {
      frameRate: WebcamFrameRatePreset.FPS30,
      resolution: WebcamResolutionPreset.P720,
    },
  });
  const stableTrack = lease.stream.getVideoTracks()[0];

  await owner.switchInput('replacement-camera');

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
    canvas: { height: 720, width: 1280 },
    context,
  });
  expect(drawing.drawLiveFrame()).toBe(true);

  expect(initial.track.stop).toHaveBeenCalledOnce();
  expect(replacement.track.stop).not.toHaveBeenCalled();
  expect(lease.stream.getVideoTracks()[0]).toBe(stableTrack);
  expect(context.drawImage).toHaveBeenCalledWith(
    expect.any(HTMLVideoElement),
    0,
    60,
    640,
    360,
    0,
    0,
    1280,
    720
  );
  expect(acquireRawStream).toHaveBeenLastCalledWith({
    audio: false,
    video: expect.objectContaining({
      deviceId: { exact: 'replacement-camera' },
      frameRate: { ideal: 30, max: 30 },
      height: { max: 640 },
      width: { ideal: 640, max: 640 },
    }),
  });
  lease.release();
  expect(replacement.track.stop).toHaveBeenCalledOnce();
});

it('switches an existing preview session before cloning it for an explicitly selected camera', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  createCanvasVideoOutputMock.mockReturnValue(createCanvasOutput(output));
  const acquireRawStream = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(replacement);
  const owner = createCameraSourceOwner({
    acquireRawStream,
    createVideo: () => createVideo(),
    waitForMetadata: vi.fn().mockResolvedValue(undefined),
  });
  const defaultPreview = await owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    webcamDeviceId: null,
  });

  const selectedPreview = await owner.acquire({
    ...DEFAULT_VIDEO_SETTINGS,
    webcamDeviceId: 'selected-camera',
  });

  expect(acquireRawStream).toHaveBeenCalledTimes(2);
  expect(acquireRawStream).toHaveBeenLastCalledWith({
    audio: false,
    video: expect.objectContaining({ deviceId: { exact: 'selected-camera' } }),
  });
  expect(initial.track.stop).toHaveBeenCalledOnce();
  expect(selectedPreview.stream.getVideoTracks()[0]).not.toBe(
    defaultPreview.stream.getVideoTracks()[0]
  );
  defaultPreview.release();
  expect(replacement.track.stop).not.toHaveBeenCalled();
  selectedPreview.release();
  expect(replacement.track.stop).toHaveBeenCalledOnce();
});

it('rolls back a replacement that fails metadata validation', async () => {
  const initial = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const replacement = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  createCanvasVideoOutputMock.mockReturnValue(
    createCanvasOutput(createTrackedStream({ frameRate: 30, height: 720, width: 1280 }))
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
  createCanvasVideoOutputMock.mockReturnValue(createCanvasOutput(output));
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
