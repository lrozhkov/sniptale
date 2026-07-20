// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  acquireRecordingSourceStreamMock,
  attachMicrophoneAudioIfEnabledMock,
  createRecordingVideoStreamMock,
  loggerDebugMock,
  resolveCaptureDimensionsMock,
} = vi.hoisted(() => ({
  acquireRecordingSourceStreamMock: vi.fn(),
  attachMicrophoneAudioIfEnabledMock: vi.fn(),
  createRecordingVideoStreamMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  resolveCaptureDimensionsMock: vi.fn(),
}));

vi.mock('./capture', () => ({
  acquireRecordingSourceStream: acquireRecordingSourceStreamMock,
  resolveCaptureDimensions: resolveCaptureDimensionsMock,
}));

vi.mock('./video', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./video')>()),
  attachMicrophoneAudioIfEnabled: attachMicrophoneAudioIfEnabledMock,
  createRecordingVideoStream: createRecordingVideoStreamMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

function createSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  resolveCaptureDimensionsMock.mockReturnValue({
    captureHeight: undefined,
    captureWidth: undefined,
  });
});

it('omits undefined optional params when preparing the recording stream', async () => {
  const sourceStream = { id: 'source-stream' };
  const videoTrack = {
    getSettings: () => ({ frameRate: 30, height: 720, width: 1280 }),
    kind: 'video',
  };
  const videoStream = {
    getVideoTracks: () => [videoTrack],
  };

  acquireRecordingSourceStreamMock.mockResolvedValue({
    cursorCaptureMode: null,
    stream: sourceStream,
  });
  createRecordingVideoStreamMock.mockResolvedValue(videoStream);

  await expect(
    prepareRecordingStream({
      settings: createSettings() as never,
      streamId: 'stream-1',
    })
  ).resolves.toEqual({
    cursorCaptureMode: null,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });

  expect(acquireRecordingSourceStreamMock).toHaveBeenCalledWith({
    settings: createSettings(),
    streamId: 'stream-1',
  });
  expect(createRecordingVideoStreamMock).toHaveBeenCalledWith({
    fullStream: sourceStream,
    settings: createSettings(),
  });
  expect(attachMicrophoneAudioIfEnabledMock).toHaveBeenCalledWith(createSettings());
});

it('throws when the prepared recording stream has no video track', async () => {
  acquireRecordingSourceStreamMock.mockResolvedValue({
    cursorCaptureMode: null,
    stream: { id: 'source-stream' },
  });
  createRecordingVideoStreamMock.mockResolvedValue({
    getVideoTracks: () => [],
  });

  await expect(
    prepareRecordingStream({
      settings: createSettings() as never,
      streamId: 'stream-2',
    })
  ).rejects.toThrow('Recording stream is missing a video track.');
});

it('logs viewport preset readiness and keeps resolved capture bounds in the result', async () => {
  const sourceStream = { id: 'source-stream' };
  const videoTrack = {
    getSettings: () => ({ frameRate: 60, height: 900, width: 1600 }),
    kind: 'video',
  };
  const videoStream = {
    getVideoTracks: () => [videoTrack],
  };

  resolveCaptureDimensionsMock.mockReturnValue({
    captureHeight: 900,
    captureWidth: 1600,
  });
  acquireRecordingSourceStreamMock.mockResolvedValue({
    cursorCaptureMode: null,
    stream: sourceStream,
  });
  createRecordingVideoStreamMock.mockResolvedValue(videoStream);

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      emulatedViewportCssSize: { height: 540, width: 960 },
      settings: createSettings() as never,
      streamId: 'stream-3',
      targetResolution: { height: 900, width: 1600 },
    })
  ).resolves.toEqual({
    captureHeight: 900,
    captureWidth: 1600,
    cursorCaptureMode: null,
    trackSettings: { frameRate: 60, height: 900, width: 1600 },
  });

  expect(loggerDebugMock).toHaveBeenCalledWith('Viewport preset stream ready', {
    targetResolution: { height: 900, width: 1600 },
    trackSettingsFrameRate: 60,
    trackSettingsHeight: 900,
    trackSettingsWidth: 1600,
    viewportSizeInPixels: { height: 540, width: 960 },
  });
});
