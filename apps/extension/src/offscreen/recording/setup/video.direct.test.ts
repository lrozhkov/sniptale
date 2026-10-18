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

const { audioMixerInstances, loggerWarnMock, microphoneFailure } = vi.hoisted(() => ({
  microphoneFailure: { current: null as Error | null },
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
    addMicrophone = vi.fn(async () => {
      if (microphoneFailure.current) throw microphoneFailure.current;
    });
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
import { attachMicrophoneAudioIfEnabled, prepareStableTabRecordingAudio } from './video';

function createSettings(overrides: Partial<VideoRecordingSettings> = {}): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 3,
    interactionDiagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile },
    systemAudioEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  audioMixerInstances.length = 0;
  microphoneFailure.current = null;
  vi.stubGlobal('MediaStream', TestMediaStream);
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
});

it('leaves audio untouched when microphone capture is disabled', async () => {
  await attachMicrophoneAudioIfEnabled(createSettings());

  expect(audioMixerInstances).toHaveLength(0);
});

it('creates a stable silent tab audio output before a microphone is enabled live', async () => {
  recordingContext.videoStream = createStream(1280, 720);

  await prepareStableTabRecordingAudio(createSettings());

  expect(audioMixerInstances).toHaveLength(1);
  expect(audioMixerInstances[0]?.initialize).toHaveBeenCalledOnce();
  expect(audioMixerInstances[0]?.addMicrophone).not.toHaveBeenCalled();
  expect(recordingContext.videoStream?.getVideoTracks()).toHaveLength(1);
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
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

it('conditions default-gain microphone audio while preserving the direct video track', async () => {
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
  expect(audioMixerInstances).toHaveLength(1);
  expect(audioMixerInstances[0]?.addMicrophone).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneGain: 1 })
  );
  expect(recordingContext.videoStream?.getVideoTracks()[0]).toBe(videoStream.getVideoTracks()[0]);
  expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
  expect(getUserMedia).not.toHaveBeenCalled();
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

it('uses the mixer for non-unity direct microphone gain', async () => {
  recordingContext.videoStream = createStream(1280, 720);
  await attachMicrophoneAudioIfEnabled(
    createSettings({ microphoneEnabled: true, microphoneGain: 0.5 })
  );
  expect(audioMixerInstances[0]?.addMicrophone).toHaveBeenCalledOnce();
});

it('preserves video and reports a microphone mixer failure', async () => {
  microphoneFailure.current = new Error('microphone denied');
  const video = createStream(1280, 720);
  recordingContext.videoStream = video;
  await attachMicrophoneAudioIfEnabled(createSettings({ microphoneEnabled: true }));
  expect(recordingContext.videoStream).toBe(video);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to attach direct microphone track',
    microphoneFailure.current
  );
});

it('does not create a stable audio graph without a video stream', async () => {
  await prepareStableTabRecordingAudio(createSettings({ microphoneEnabled: true }));
  expect(audioMixerInstances).toHaveLength(0);
  expect(recordingContext.videoStream).toBeNull();
});

it.each([false, true])(
  'preserves tab video and source audio when microphone refusal is %s',
  async (refused) => {
    const source = createAudioStream();
    const video = createStream(1280, 720);
    recordingContext.sourceStream = source;
    recordingContext.videoStream = video;
    if (refused) microphoneFailure.current = new Error('microphone denied');

    await prepareStableTabRecordingAudio(
      createSettings({ microphoneEnabled: true, systemAudioEnabled: true })
    );

    expect(audioMixerInstances[0]?.addTabAudio).toHaveBeenCalledWith(source);
    expect(audioMixerInstances[0]?.addMicrophone).toHaveBeenCalledOnce();
    expect(recordingContext.videoStream?.getVideoTracks()[0]).toBe(video.getVideoTracks()[0]);
    expect(recordingContext.videoStream?.getAudioTracks()).toHaveLength(1);
    if (refused) {
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'Failed to add microphone',
        microphoneFailure.current
      );
    } else {
      expect(loggerWarnMock).not.toHaveBeenCalled();
    }
  }
);
