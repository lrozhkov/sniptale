// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import {
  TestMediaStream,
  createAudioStream,
  createEmptyStream,
  createStream,
} from '../multi-source/media-stream.test-support';
import { type VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { audioMixerInstances, loggerWarnMock } = vi.hoisted(() => ({
  audioMixerInstances: [] as Array<{
    addMicrophone: ReturnType<typeof vi.fn>;
    addTabAudio: ReturnType<typeof vi.fn>;
    getMixedStream: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
  }>,
  loggerWarnMock: vi.fn(),
}));

vi.mock('../stream/audio-mixer', () => ({
  AudioMixer: class {
    addMicrophone = vi.fn().mockResolvedValue(undefined);
    addTabAudio = vi.fn().mockResolvedValue(undefined);
    getMixedStream = vi.fn(() => createAudioStream());
    initialize = vi.fn().mockResolvedValue(undefined);

    constructor() {
      audioMixerInstances.push(this);
    }
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

import { recordingContext } from '../context';
import { attachMicrophoneAudioIfEnabled } from './video';

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile },
    systemAudioEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  audioMixerInstances.length = 0;
  vi.stubGlobal('MediaStream', TestMediaStream);
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
});

it('leaves audio untouched when microphone capture is disabled', async () => {
  await attachMicrophoneAudioIfEnabled(createSettings());

  expect(audioMixerInstances).toHaveLength(0);
});

it('skips direct microphone access when the current recording stream has no video track', async () => {
  const getUserMedia = vi.fn();

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  recordingContext.videoStream = createEmptyStream();

  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
    })
  );

  expect(getUserMedia).not.toHaveBeenCalled();
});

it('keeps the direct video track when microphone access returns no audio tracks', async () => {
  const getUserMedia = vi.fn().mockResolvedValue(createEmptyStream());

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  const videoStream = createStream(1280, 720);
  recordingContext.videoStream = videoStream;

  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
    })
  );

  expect(videoStream.getVideoTracks()).toHaveLength(1);
  expect(videoStream.getAudioTracks()).toHaveLength(0);
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('mixes source and microphone audio when system audio is enabled', async () => {
  const source = new TestMediaStream([
    ...createAudioStream().getAudioTracks(),
    ...createStream(1280, 720).getVideoTracks(),
  ]);
  recordingContext.sourceStream = source;
  recordingContext.videoStream = source;

  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneEnabled: true,
      systemAudioEnabled: true,
    })
  );

  expect(audioMixerInstances).toHaveLength(1);
  expect(audioMixerInstances[0]?.initialize).toHaveBeenCalledOnce();
  expect(audioMixerInstances[0]?.addTabAudio).toHaveBeenCalledWith(source);
  expect(audioMixerInstances[0]?.addMicrophone).toHaveBeenCalledOnce();
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
});

it('uses the mixer for non-unity direct microphone gain and reports direct failures', async () => {
  recordingContext.videoStream = createStream(1280, 720);
  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneEnabled: true,
      microphoneGain: 0.5,
    })
  );
  expect(audioMixerInstances[0]?.addMicrophone).toHaveBeenCalledOnce();

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error('microphone denied')) },
  });
  recordingContext.videoStream = createStream(1280, 720);
  await attachMicrophoneAudioIfEnabled(
    createSettings({
      microphoneEnabled: true,
      microphoneGain: 1,
    })
  );
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to attach direct microphone track',
    expect.any(Error)
  );
});
