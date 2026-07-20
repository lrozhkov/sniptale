// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

const {
  applyCanvasCropMock,
  audioMixerAddTabAudioMock,
  audioMixerAddMicrophoneMock,
  audioMixerGetMixedStreamMock,
  audioMixerInitializeMock,
  consumeDesktopStreamMock,
  createViewportPresetStreamMock,
  detachCachedPreviewMock,
  loggerDebugMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  applyCanvasCropMock: vi.fn(),
  audioMixerAddTabAudioMock: vi.fn(),
  audioMixerAddMicrophoneMock: vi.fn(),
  audioMixerGetMixedStreamMock: vi.fn(),
  audioMixerInitializeMock: vi.fn(),
  consumeDesktopStreamMock: vi.fn(),
  createViewportPresetStreamMock: vi.fn(),
  detachCachedPreviewMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../stream/audio-mixer', () => ({
  AudioMixer: class {
    addTabAudio = audioMixerAddTabAudioMock;
    initialize = audioMixerInitializeMock;
    addMicrophone = audioMixerAddMicrophoneMock;
    getMixedStream = audioMixerGetMixedStreamMock;
  },
}));

vi.mock('../stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream')>()),
  applyCanvasCrop: applyCanvasCropMock,
  createViewportPresetStream: createViewportPresetStreamMock,
  normalizeRecordingStreamDimensions: vi.fn(async (stream) => stream),
}));
vi.mock('./desktop-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./desktop-media')>()),
  consumeDesktopStream: consumeDesktopStreamMock,
  detachCachedPreview: detachCachedPreviewMock,
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));

import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';

class MediaStreamMock {
  active = true;

  constructor(
    private readonly tracks: Array<{ kind: string; getSettings?: () => MediaTrackSettings }>
  ) {}

  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
}

function createVideoTrack(
  settings: MediaTrackSettings = { width: 1280, height: 720, frameRate: 30 }
) {
  return {
    kind: 'video',
    getSettings: () => settings,
  };
}

function createAudioTrack() {
  return { kind: 'audio' };
}

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    microphoneEnabled: false,
    microphoneDeviceId: null,
    systemAudioEnabled: false,
    quality: VideoQuality.HIGH,
    countdownSeconds: 3,
    autoFadeDelay: 0,
    openEditorAfterRecording: false,
    diagnosticsEnabled: false,
    ...overrides,
  };
}

function resetRecordingContext() {
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  recordingContext.audioMixer = null;
  recordingContext.updateViewportPresetCrop = null;
  recordingContext.updateViewportPresetDrawState = null;
}

function installMediaDevicesMocks(overrides: Partial<MediaDevices> = {}) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn(),
      getUserMedia: vi.fn(),
      ...overrides,
    },
  });
}

function resetOffscreenRecordingSetupTestState() {
  vi.clearAllMocks();
  vi.stubGlobal('MediaStream', MediaStreamMock as unknown as typeof MediaStream);
  resetRecordingContext();
  installMediaDevicesMocks();
}

async function verifyScreenCaptureUsesCachedDesktopStream() {
  const cachedStream = new MediaStreamMock([
    createVideoTrack({ width: 1920, height: 1080, frameRate: 60 }),
  ]);
  consumeDesktopStreamMock.mockReturnValue({
    stream: cachedStream,
    label: 'Screen 1',
  });

  const result = await prepareRecordingStream({
    streamId: 'stream-1',
    settings: createSettings(),
    captureMode: CaptureMode.SCREEN,
  });

  expect(consumeDesktopStreamMock).toHaveBeenCalledOnce();
  expect(detachCachedPreviewMock).not.toHaveBeenCalled();
  expect(recordingContext.sourceStream).toBe(cachedStream as never);
  expect(recordingContext.videoStream).toBe(cachedStream as never);
  expect(recordingContext.updateViewportPresetCrop).toBeNull();
  expect(recordingContext.updateViewportPresetDrawState).toBeNull();
  expect(result.captureWidth).toBeUndefined();
  expect(result.captureHeight).toBeUndefined();
  expect(result.cursorCaptureMode).toBeNull();
  expect(result.trackSettings).toEqual({ width: 1920, height: 1080, frameRate: 60 });
}

async function verifyViewportEmulationSetup() {
  const tabStream = new MediaStreamMock([createVideoTrack()]);
  const viewportStream = new MediaStreamMock([
    createVideoTrack({ width: 1600, height: 900, frameRate: 30 }),
  ]);
  const getUserMedia = vi.fn().mockResolvedValue(tabStream);

  installMediaDevicesMocks({ getUserMedia });
  consumeDesktopStreamMock.mockReturnValue({
    stream: { active: false, getVideoTracks: () => [{ readyState: 'ended' }] },
    label: null,
  });
  createViewportPresetStreamMock.mockResolvedValue({
    stream: viewportStream,
    updateCrop: vi.fn(),
    updateDrawState: vi.fn(),
  });
  const result = await prepareRecordingStream({
    streamId: 'stream-2',
    settings: createSettings(),
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    targetResolution: { width: 1600, height: 900 },
    emulatedViewportCssSize: { width: 960, height: 540 },
  });

  expect(detachCachedPreviewMock).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'stream-2',
        maxWidth: 1600,
        maxHeight: 900,
      },
    },
  });
  expect(createViewportPresetStreamMock).toHaveBeenCalledWith(
    tabStream,
    { width: 1600, height: 900 },
    VideoQuality.HIGH,
    { width: 960, height: 540 }
  );
  expect(recordingContext.sourceStream).toBe(tabStream as never);
  expect(recordingContext.videoStream).toBe(viewportStream as never);
  expect(recordingContext.updateViewportPresetCrop).toEqual(expect.any(Function));
  expect(recordingContext.updateViewportPresetDrawState).toEqual(expect.any(Function));
  expect(result.cursorCaptureMode).toBeNull();
  expect(result.trackSettings).toEqual({ width: 1600, height: 900, frameRate: 30 });
}

function configureTabCropRecordingSetup() {
  const fullStream = new MediaStreamMock([createVideoTrack(), createAudioTrack()]);
  const croppedStream = new MediaStreamMock([
    createVideoTrack({ width: 640, height: 360, frameRate: 24 }),
  ]);
  const mixedAudioStream = new MediaStreamMock([createAudioTrack()]);
  const getUserMedia = vi.fn().mockResolvedValue(fullStream);

  installMediaDevicesMocks({ getUserMedia });
  applyCanvasCropMock.mockResolvedValue(croppedStream);
  audioMixerInitializeMock.mockResolvedValue(undefined);
  audioMixerAddTabAudioMock.mockResolvedValue(undefined);
  audioMixerAddMicrophoneMock.mockResolvedValue(undefined);
  audioMixerGetMixedStreamMock.mockReturnValue(mixedAudioStream);

  return { croppedStream, fullStream, getUserMedia };
}

async function verifyTabCropSetupWithMicrophone() {
  const { getUserMedia } = configureTabCropRecordingSetup();

  const result = await prepareRecordingStream({
    streamId: 'stream-3',
    settings: createSettings({
      microphoneEnabled: true,
      microphoneDeviceId: 'mic-1',
      systemAudioEnabled: true,
    }),
    viewport: { width: 320, height: 180, devicePixelRatio: 2 },
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'stream-3',
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'stream-3',
        maxWidth: 640,
        maxHeight: 360,
      },
    },
  });
  expect(applyCanvasCropMock).toHaveBeenCalledWith(
    expect.any(MediaStreamMock),
    { x: 1, y: 2, width: 3, height: 4 },
    VideoQuality.HIGH,
    { width: 640, height: 360 }
  );
  expect(audioMixerInitializeMock).toHaveBeenCalledOnce();
  expect(audioMixerAddTabAudioMock).toHaveBeenCalledWith(expect.any(MediaStreamMock));
  expect(audioMixerAddMicrophoneMock).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneDeviceId: 'mic-1' })
  );
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
  expect(result.captureWidth).toBe(640);
  expect(result.captureHeight).toBe(360);
  expect(result.cursorCaptureMode).toBeNull();
  expect(result.trackSettings).toEqual({ width: 640, height: 360, frameRate: 24 });
}

function runOffscreenRecordingSetupSuite() {
  beforeEach(resetOffscreenRecordingSetupTestState);
  it(
    'reuses an active cached desktop stream for screen capture',
    verifyScreenCaptureUsesCachedDesktopStream
  );
  it(
    'creates a viewport-emulation stream from a fresh desktop capture',
    verifyViewportEmulationSetup
  );
  it(
    'captures tab streams, applies crop, and attaches microphone audio when enabled',
    verifyTabCropSetupWithMicrophone
  );
}

describe('offscreen-recording-setup', runOffscreenRecordingSetupSuite);
