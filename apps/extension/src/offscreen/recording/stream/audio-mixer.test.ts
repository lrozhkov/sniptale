import { beforeEach, describe, expect, it, vi } from 'vitest';

const { translate } = vi.hoisted(() => ({
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate,
}));

import { AudioMixer } from './audio-mixer';
import { AudioMixerGraph } from './audio-mixer-graph';
import {
  createAudioStream,
  createEmptyStream,
  TestMediaStream,
} from '../multi-source/media-stream.test-support';

const { connectMicrophoneStreamMock, connectTabStreamMock, getMixedStreamMock, hasAudioMock } =
  vi.hoisted(() => ({
    connectMicrophoneStreamMock: vi.fn(),
    connectTabStreamMock: vi.fn(),
    getMixedStreamMock: vi.fn(),
    hasAudioMock: vi.fn(),
  }));

vi.mock('./audio-mixer-graph', () => ({
  AudioMixerGraph: vi.fn(function MockAudioMixerGraph() {
    return {
      cleanup: vi.fn().mockResolvedValue(undefined),
      connectMicrophoneStream: connectMicrophoneStreamMock,
      connectTabStream: connectTabStreamMock,
      disconnectMicrophoneStream: vi.fn(),
      disconnectTabStream: vi.fn(),
      getMixedStream: getMixedStreamMock,
      hasAudio: hasAudioMock,
      initialize: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getMixedStreamMock.mockReturnValue(createAudioStream());
  vi.stubGlobal('MediaStream', TestMediaStream);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(),
    },
  });
});

function getOnlyAudioTrack(stream: MediaStream): MediaStreamTrack {
  const [track] = stream.getAudioTracks();
  if (!track) {
    throw new Error('Expected an audio track in the media stream fixture.');
  }
  return track;
}

function verifiesInitialization(): void {
  const mixer = new AudioMixer();
  expect(AudioMixerGraph).toHaveBeenCalledOnce();
  expect(mixer.getMixedStream()).toBe(getMixedStreamMock.mock.results[0]?.value);
}

async function verifiesTabAudioHandling(): Promise<void> {
  const mixer = new AudioMixer();

  await mixer.addTabAudio(createEmptyStream());
  expect(connectTabStreamMock).not.toHaveBeenCalled();

  await mixer.addTabAudio(createAudioStream());
  expect(connectTabStreamMock).toHaveBeenCalledTimes(1);
}

async function verifiesMicrophoneLifecycle(): Promise<void> {
  const micStream = createAudioStream();
  const micTrack = getOnlyAudioTrack(micStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(micStream);
  const mixer = new AudioMixer();

  await mixer.addMicrophone('mic-1');

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      deviceId: { exact: 'mic-1' },
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
  expect(connectMicrophoneStreamMock).toHaveBeenCalledTimes(1);

  mixer.removeMicrophone();
  expect(micTrack.stop).toHaveBeenCalledTimes(1);
}

async function verifiesMicrophoneSettings(): Promise<void> {
  const micStream = createAudioStream();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(micStream);
  const mixer = new AudioMixer();

  await mixer.addMicrophone({
    autoGainControl: false,
    echoCancellation: false,
    microphoneDeviceId: 'mic-2',
    microphoneGain: 1.5,
    noiseSuppression: true,
  });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: false,
      deviceId: { exact: 'mic-2' },
      echoCancellation: false,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
  expect(connectMicrophoneStreamMock).toHaveBeenCalledWith(micStream, 1.5);
}

async function verifiesMicrophoneFailure(): Promise<void> {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'));
  const mixer = new AudioMixer();

  await expect(mixer.addMicrophone()).rejects.toThrow('popup.video.microphoneAccessError');
}

async function verifiesMicrophoneGraphFailureCleanup(): Promise<void> {
  const micStream = createAudioStream();
  const micTrack = getOnlyAudioTrack(micStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(micStream);
  connectMicrophoneStreamMock.mockImplementationOnce(() => {
    throw new Error('graph failed');
  });
  const mixer = new AudioMixer();

  await expect(mixer.addMicrophone()).rejects.toThrow('popup.video.microphoneAccessError');

  expect(micTrack.stop).toHaveBeenCalledTimes(1);
}

async function verifiesCleanup(): Promise<void> {
  const tabStream = createAudioStream();
  const micStream = createAudioStream();
  const tabTrack = getOnlyAudioTrack(tabStream);
  const micTrack = getOnlyAudioTrack(micStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(micStream);
  const mixer = new AudioMixer();
  const graphCleanup = vi.mocked(AudioMixerGraph).mock.results[0]?.value.cleanup as ReturnType<
    typeof vi.fn
  >;

  await mixer.addTabAudio(tabStream);
  await mixer.addMicrophone();
  await mixer.cleanup();

  expect(tabTrack.stop).toHaveBeenCalledTimes(1);
  expect(micTrack.stop).toHaveBeenCalledTimes(1);
  expect(graphCleanup).toHaveBeenCalledTimes(1);
}

function verifiesRemoveMicrophoneWithoutActiveStream(): void {
  const mixer = new AudioMixer();

  mixer.removeMicrophone();

  expect(mixer.getMixedStream()).toBe(getMixedStreamMock.mock.results[0]?.value);
}

describe('AudioMixer', () => {
  it('delegates graph ownership to the dedicated graph seam', verifiesInitialization);
  it('adds tab audio only when the tab stream has audio tracks', verifiesTabAudioHandling);
  it('adds and removes microphone audio', verifiesMicrophoneLifecycle);
  it(
    'applies selected microphone processing settings and software gain',
    verifiesMicrophoneSettings
  );
  it('throws a translated error when microphone access fails', verifiesMicrophoneFailure);
  it(
    'stops acquired microphone tracks when graph connection fails',
    verifiesMicrophoneGraphFailureCleanup
  );
  it('cleans up tracks and audio context resources', verifiesCleanup);
  it(
    'allows microphone removal even when no microphone stream is active',
    verifiesRemoveMicrophoneWithoutActiveStream
  );
});
