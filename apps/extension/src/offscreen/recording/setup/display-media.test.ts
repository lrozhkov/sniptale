// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

const { consumeDesktopStreamMock, detachCachedPreviewMock, loggerDebugMock } = vi.hoisted(() => ({
  consumeDesktopStreamMock: vi.fn(),
  detachCachedPreviewMock: vi.fn(),
  loggerDebugMock: vi.fn(),
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
  applyCanvasCrop: vi.fn(),
  createViewportPresetStream: vi.fn(),
  normalizeRecordingStreamDimensions: vi.fn(async (stream) => stream),
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
    warn: vi.fn(),
  }),
}));

import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';

class MediaStreamMock {
  active = true;

  constructor(
    private readonly tracks: Array<{ kind: string; getSettings?: () => MediaTrackSettings }>
  ) {}

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

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
  vi.stubGlobal('MediaStream', MediaStreamMock);
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.updateViewportPresetCrop = null;
  recordingContext.updateViewportPresetDrawState = null;
  recordingContext.videoStream = null;
});

it('fails fast when the selected desktop stream is stale instead of prompting again', async () => {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() },
  });
  consumeDesktopStreamMock.mockReturnValue({
    label: null,
    stream: {
      active: false,
      getVideoTracks: () => [{ readyState: 'ended' }],
    },
  });

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.SCREEN,
      settings: createSettings(),
      streamId: 'screen-stale',
    })
  ).rejects.toThrow('Desktop media stream was not available after source selection');

  expect(detachCachedPreviewMock).toHaveBeenCalledOnce();
  expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
  expect(recordingContext.sourceStream).toBeNull();
  expect(recordingContext.videoStream).toBeNull();
});
