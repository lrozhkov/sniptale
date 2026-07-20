// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { attachMicrophoneAudioIfEnabled } from './video';
import { recordingContext } from '../context';
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

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));

class MediaStreamMock {
  active = true;

  constructor(private readonly tracks: Array<{ kind: string }>) {}

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

function createVideoTrack() {
  return { kind: 'video' };
}

function createAudioTrack() {
  return { kind: 'audio' };
}

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    microphoneEnabled: true,
    microphoneDeviceId: 'mic-1',
    systemAudioEnabled: true,
    quality: VideoQuality.HIGH,
    countdownSeconds: 3,
    autoFadeDelay: 0,
    openEditorAfterRecording: false,
    diagnosticsEnabled: false,
    ...overrides,
  };
}

function resetRecordingContext() {
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
}

function installRecordingStreams() {
  recordingContext.sourceStream = new MediaStreamMock([
    createVideoTrack(),
    createAudioTrack(),
  ]) as never;
  recordingContext.videoStream = new MediaStreamMock([createVideoTrack()]) as never;
}

async function runMixerSetupWithFailures(params: {
  mixedAudioTrackCount: number;
  microphoneError?: Error;
  tabAudioError?: Error;
}) {
  installRecordingStreams();
  audioMixerAddTabAudioMock.mockReset();
  audioMixerAddMicrophoneMock.mockReset();
  audioMixerGetMixedStreamMock.mockReset();
  audioMixerGetMixedStreamMock.mockReturnValue(
    new MediaStreamMock(
      Array.from({ length: params.mixedAudioTrackCount }, () => createAudioTrack())
    ) as never
  );

  if (params.tabAudioError) {
    audioMixerAddTabAudioMock.mockRejectedValueOnce(params.tabAudioError);
  }

  if (params.microphoneError) {
    audioMixerAddMicrophoneMock.mockRejectedValueOnce(params.microphoneError);
  }

  await attachMicrophoneAudioIfEnabled(createSettings());
}

async function attachDirectMicrophoneTrackWithoutSystemAudio() {
  const microphoneTrack = createAudioTrack();
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStreamMock([microphoneTrack]) as never);

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  recordingContext.videoStream = new MediaStreamMock([createVideoTrack()]) as never;

  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneEnabled: true,
      microphoneDeviceId: 'mic-direct',
      systemAudioEnabled: false,
    })
  );

  expect(audioMixerInitializeMock).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      deviceId: { exact: 'mic-direct' },
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
  const directMicVideoStream = recordingContext.videoStream as unknown as MediaStreamMock;
  expect(directMicVideoStream.getAudioTracks()).toHaveLength(1);
}

async function verifiesMicrophoneOnlyFallbackWhenTabAudioFails() {
  const tabAudioError = new Error('tab audio failed');

  await runMixerSetupWithFailures({
    mixedAudioTrackCount: 1,
    tabAudioError,
  });

  expect(audioMixerInitializeMock).toHaveBeenCalledTimes(1);
  expect(audioMixerAddTabAudioMock).toHaveBeenCalledWith(recordingContext.sourceStream);
  expect(audioMixerAddMicrophoneMock).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneDeviceId: 'mic-1' })
  );
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to add tab audio to mixer', tabAudioError);
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
}

async function verifiesSystemAudioOnlyFallbackWhenMicrophoneFails() {
  const microphoneError = new Error('microphone failed');

  await runMixerSetupWithFailures({
    mixedAudioTrackCount: 1,
    microphoneError,
  });

  expect(audioMixerAddTabAudioMock).toHaveBeenCalledWith(recordingContext.sourceStream);
  expect(audioMixerAddMicrophoneMock).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneDeviceId: 'mic-1' })
  );
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to add microphone', microphoneError);
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
}

async function verifiesVideoOnlyFallbackWhenAllAudioFails() {
  const tabAudioError = new Error('tab audio failed');
  const microphoneError = new Error('microphone failed');

  await runMixerSetupWithFailures({
    mixedAudioTrackCount: 0,
    microphoneError,
    tabAudioError,
  });

  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to add tab audio to mixer', tabAudioError);
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to add microphone', microphoneError);
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(0);
}

function registerAudioMixerDegradationTests() {
  it(
    'keeps recording with microphone-only mixed audio when tab-audio attachment fails',
    verifiesMicrophoneOnlyFallbackWhenTabAudioFails
  );
  it(
    'keeps recording with system-audio-only mixed audio when microphone attachment fails',
    verifiesSystemAudioOnlyFallbackWhenMicrophoneFails
  );
  it(
    'leaves the recording stream video-only when both mixer audio paths fail',
    verifiesVideoOnlyFallbackWhenAllAudioFails
  );
  it(
    'attaches the microphone directly when system audio is disabled',
    attachDirectMicrophoneTrackWithoutSystemAudio
  );
}

describe('offscreen-recording audio mixer degradation paths', registerAudioMixerDegradationTests);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaStream', MediaStreamMock as unknown as typeof MediaStream);
  resetRecordingContext();
});
