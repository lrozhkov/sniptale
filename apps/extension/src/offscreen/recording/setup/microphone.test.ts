// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

const {
  audioMixerAddMicrophoneMock,
  audioMixerAddTabAudioMock,
  audioMixerGetMixedStreamMock,
  audioMixerInitializeMock,
  loggerDebugMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  audioMixerAddMicrophoneMock: vi.fn(),
  audioMixerAddTabAudioMock: vi.fn(),
  audioMixerGetMixedStreamMock: vi.fn(),
  audioMixerInitializeMock: vi.fn(),
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
  applyCanvasCrop: vi.fn(),
  createViewportPresetStream: vi.fn(),
  normalizeRecordingStreamDimensions: vi.fn(async (stream) => stream),
}));

vi.mock('./desktop-media', () => ({
  consumeDesktopStream: vi.fn(),
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: vi.fn(),
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
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
}

function installMediaDevicesMocks(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn(),
      getUserMedia,
    },
  });
}

function createMicrophoneOnlySetup() {
  const fullStream = new MediaStreamMock([createVideoTrack()]);
  const microphoneStream = new MediaStreamMock([createAudioTrack()]);
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce(fullStream)
    .mockResolvedValueOnce(microphoneStream);

  installMediaDevicesMocks(getUserMedia);
  return { getUserMedia };
}

async function verifiesDirectMicrophoneTrackWithoutSystemAudio() {
  const { getUserMedia } = createMicrophoneOnlySetup();

  const result = await prepareRecordingStream({
    streamId: 'stream-4',
    settings: createSettings({
      microphoneEnabled: true,
      microphoneDeviceId: 'mic-2',
      systemAudioEnabled: false,
    }),
  });

  expect(getUserMedia).toHaveBeenNthCalledWith(1, {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'stream-4',
      },
    },
  });
  expect(getUserMedia).toHaveBeenNthCalledWith(2, {
    audio: {
      autoGainControl: true,
      deviceId: { exact: 'mic-2' },
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
  expect(audioMixerInitializeMock).not.toHaveBeenCalled();
  expect(audioMixerAddTabAudioMock).not.toHaveBeenCalled();
  expect(audioMixerAddMicrophoneMock).not.toHaveBeenCalled();
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
  expect(result.trackSettings).toEqual({ width: 1280, height: 720, frameRate: 30 });
}

async function verifiesDirectMicrophoneGainMixerPath() {
  const { getUserMedia } = createMicrophoneOnlySetup();
  audioMixerGetMixedStreamMock.mockReturnValue(new MediaStreamMock([createAudioTrack()]));

  await prepareRecordingStream({
    streamId: 'stream-5',
    settings: createSettings({
      microphoneEnabled: true,
      microphoneDeviceId: 'mic-2',
      microphoneGain: 1.5,
      systemAudioEnabled: false,
    }),
  });

  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(audioMixerInitializeMock).toHaveBeenCalledOnce();
  expect(audioMixerAddMicrophoneMock).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneDeviceId: 'mic-2', microphoneGain: 1.5 })
  );
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
}

function registerMicrophoneOnlyPathTests() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('MediaStream', MediaStreamMock);
    resetRecordingContext();
  });
  it(
    'attaches a raw microphone track directly when system audio is disabled',
    verifiesDirectMicrophoneTrackWithoutSystemAudio
  );
  it(
    'routes direct microphone audio through the mixer when software gain is enabled',
    verifiesDirectMicrophoneGainMixerPath
  );
}

describe('offscreen-recording-setup microphone-only path', registerMicrophoneOnlyPathTests);
