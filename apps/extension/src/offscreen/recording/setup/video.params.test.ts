// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  applyCanvasCropMock,
  createViewportPresetStreamMock,
  loggerDebugMock,
  loggerWarnMock,
  normalizeRecordingStreamDimensionsMock,
} = vi.hoisted(() => ({
  applyCanvasCropMock: vi.fn(),
  createViewportPresetStreamMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  normalizeRecordingStreamDimensionsMock: vi.fn(),
}));

vi.mock('../stream/audio-mixer', () => ({
  AudioMixer: class {
    addMicrophone = vi.fn();
    addTabAudio = vi.fn();
    getMixedStream = vi.fn();
    initialize = vi.fn();
  },
}));

vi.mock('../stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream')>()),
  applyCanvasCrop: applyCanvasCropMock,
  createViewportPresetStream: createViewportPresetStreamMock,
  normalizeRecordingStreamDimensions: normalizeRecordingStreamDimensionsMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));

import { createRecordingVideoStream, attachMicrophoneAudioIfEnabled } from './video';
import { recordingContext } from '../context';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

class MediaStreamMock {
  constructor(private readonly tracks: Array<{ kind: string }>) {}

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaStream', MediaStreamMock as unknown as typeof MediaStream);
  normalizeRecordingStreamDimensionsMock.mockImplementation(async (stream) => stream);
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
});

it('covers crop and viewport-emulation branches when optional viewport sizing is omitted', async () => {
  const fullStream = { id: 'full-stream' } as MediaStream;

  applyCanvasCropMock.mockResolvedValue('crop-stream');
  createViewportPresetStreamMock.mockResolvedValue({
    stream: 'viewport-stream',
    updateCrop: vi.fn(),
    updateDrawState: vi.fn(),
  });

  await expect(
    createRecordingVideoStream({
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: { height: 40, width: 30, x: 10, y: 20 },
      fullStream,
      settings: { quality: VideoQuality.HIGH } as never,
    })
  ).resolves.toBe('crop-stream');

  await expect(
    createRecordingVideoStream({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      fullStream,
      settings: { quality: VideoQuality.HIGH } as never,
      targetResolution: { height: 720, width: 1280 },
    })
  ).resolves.toBe('viewport-stream');

  expect(applyCanvasCropMock).toHaveBeenCalledWith(
    fullStream,
    { height: 40, width: 30, x: 10, y: 20 },
    VideoQuality.HIGH,
    undefined
  );
  expect(createViewportPresetStreamMock).toHaveBeenCalledWith(
    fullStream,
    { height: 720, width: 1280 },
    VideoQuality.HIGH,
    undefined
  );
});

it('normalizes direct tab streams before they reach MediaRecorder', async () => {
  const fullStream = { id: 'full-stream' } as MediaStream;
  normalizeRecordingStreamDimensionsMock.mockResolvedValue('normalized-stream');

  await expect(
    createRecordingVideoStream({
      captureMode: CaptureMode.TAB,
      fullStream,
      settings: { quality: VideoQuality.HIGH } as never,
    })
  ).resolves.toBe('normalized-stream');

  expect(normalizeRecordingStreamDimensionsMock).toHaveBeenCalledWith(
    fullStream,
    VideoQuality.HIGH
  );
});

it('passes device-pixel viewport dimensions into crop fallback streams', async () => {
  const fullStream = { id: 'full-stream' } as MediaStream;
  applyCanvasCropMock.mockResolvedValue('crop-stream');

  await createRecordingVideoStream({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 40, width: 30, x: 10, y: 20 },
    fullStream,
    settings: { quality: VideoQuality.HIGH } as never,
    viewport: { devicePixelRatio: 2, height: 50, width: 100 },
  });

  expect(applyCanvasCropMock).toHaveBeenCalledWith(
    fullStream,
    { height: 40, width: 30, x: 10, y: 20 },
    VideoQuality.HIGH,
    { height: 100, width: 200 }
  );
});

it('keeps screen-mode streams untouched for display capture', async () => {
  const fullStream = { id: 'screen-stream' } as MediaStream;

  await expect(
    createRecordingVideoStream({
      captureMode: CaptureMode.SCREEN,
      fullStream,
      settings: { quality: VideoQuality.HIGH } as never,
    })
  ).resolves.toBe(fullStream);
});

it('omits the direct microphone device constraint when no device id is selected', async () => {
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStreamMock([{ kind: 'audio' }]) as never);

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  recordingContext.videoStream = new MediaStreamMock([{ kind: 'video' }]) as never;

  await attachMicrophoneAudioIfEnabled({
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  } as never);

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
});
