// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { consumeDesktopStreamMock, detachCachedPreviewMock, loggerDebugMock, loggerWarnMock } =
  vi.hoisted(() => ({
    consumeDesktopStreamMock: vi.fn(),
    detachCachedPreviewMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock('./desktop-media', () => ({
  consumeDesktopStream: consumeDesktopStreamMock,
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: detachCachedPreviewMock,
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));
import {
  CaptureMode,
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { acquireRecordingSourceStream, resolveCaptureDimensions } from './capture';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function installMediaDevicesMocks(overrides: Partial<MediaDevices> = {}) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
      ...overrides,
    },
  });
}

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    ...overrides,
  };
}

it('scales viewport capture dimensions and lets viewport emulation target resolution override them', () => {
  expect(
    resolveCaptureDimensions({
      viewport: { devicePixelRatio: 2, height: 360, width: 640 },
    })
  ).toEqual({ captureHeight: 720, captureWidth: 1280 });

  expect(
    resolveCaptureDimensions({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      targetResolution: { height: 1080, width: 1920 },
      viewport: { devicePixelRatio: 2, height: 360, width: 640 },
    })
  ).toEqual({ captureHeight: 1080, captureWidth: 1920 });
});

it('normalizes odd viewport capture dimensions before requesting tab capture', () => {
  expect(
    resolveCaptureDimensions({
      viewport: { devicePixelRatio: 1, height: 767, width: 1365 },
    })
  ).toEqual({ captureHeight: 766, captureWidth: 1364 });
});

it('normalizes odd viewport-emulation target dimensions and allows missing viewport sizing', () => {
  expect(
    resolveCaptureDimensions({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      targetResolution: { height: 901, width: 1441 },
    })
  ).toEqual({ captureHeight: 900, captureWidth: 1440 });

  expect(resolveCaptureDimensions({})).toEqual({
    captureHeight: undefined,
    captureWidth: undefined,
  });
});

it('reuses active cached desktop streams for screen capture', async () => {
  installMediaDevicesMocks();
  consumeDesktopStreamMock.mockReturnValue({
    label: 'Screen 1',
    stream: {
      active: true,
      getVideoTracks: () => [{ readyState: 'live' }],
    },
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.SCREEN,
      settings: createSettings(),
      streamId: 'screen-stream',
    })
  ).resolves.toEqual(
    expect.objectContaining({
      cursorCaptureMode: null,
      stream: {
        active: true,
        getVideoTracks: expect.any(Function),
      },
    })
  );

  expect(detachCachedPreviewMock).not.toHaveBeenCalled();
});

it('fails screen capture start when the selected desktop stream is no longer cached', async () => {
  installMediaDevicesMocks();
  consumeDesktopStreamMock.mockReturnValue({
    label: null,
    stream: {
      active: false,
      getVideoTracks: () => [{ readyState: 'ended' }],
    },
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.SCREEN,
      settings: createSettings(),
      streamId: 'screen-stream',
    })
  ).rejects.toThrow('Desktop media stream was not available after source selection');

  expect(detachCachedPreviewMock).toHaveBeenCalledTimes(1);
});

it('acquires tab streams with optional system audio and optional capture bounds', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({ id: 'tab-stream' });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureHeight: 720,
    captureMode: CaptureMode.TAB_CROP,
    captureWidth: 1280,
    settings: createSettings({ systemAudioEnabled: true }),
    streamId: 'tab-stream',
  });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB_CROP,
    settings: createSettings({ systemAudioEnabled: false }),
    streamId: 'tab-stream-2',
  });

  expect(getUserMedia).toHaveBeenNthCalledWith(1, {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream',
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream',
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
  });
  expect(getUserMedia).toHaveBeenNthCalledWith(2, {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-2',
      },
    },
  });
});

it('acquires camera streams with selected device and ideal quality constraints', async () => {
  const cameraStream = { id: 'camera-stream' };
  const getUserMedia = vi.fn().mockResolvedValue(cameraStream);
  installMediaDevicesMocks({ getUserMedia });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.CAMERA,
      settings: createSettings({
        webcamDeviceId: 'cam-1',
        webcamQuality: {
          frameRate: WebcamFrameRatePreset.FPS60,
          resolution: WebcamResolutionPreset.P1080,
        },
      }),
      streamId: 'camera',
    })
  ).resolves.toEqual({
    cursorCaptureMode: null,
    stream: cameraStream,
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      deviceId: { exact: 'cam-1' },
      frameRate: { ideal: 60 },
      height: { ideal: 1080 },
      width: { ideal: 1920 },
    },
  });
});
