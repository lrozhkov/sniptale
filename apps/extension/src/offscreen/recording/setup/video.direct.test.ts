// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}));

vi.mock('../stream/audio-mixer', () => ({
  AudioMixer: class {
    addMicrophone = vi.fn();
    addTabAudio = vi.fn();
    getMixedStream = vi.fn();
    initialize = vi.fn();
  },
}));

vi.mock('../stream', () => ({
  applyCanvasCrop: vi.fn(),
  createViewportPresetStream: vi.fn(),
  normalizeRecordingStreamDimensions: vi.fn(async (stream) => stream),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

import { recordingContext } from '../context';
import { attachMicrophoneAudioIfEnabled } from './video';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

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
  recordingContext.audioMixer = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
});

it('skips direct microphone access when the current recording stream has no video track', async () => {
  const getUserMedia = vi.fn();

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  recordingContext.videoStream = new MediaStreamMock([]) as never;

  await attachMicrophoneAudioIfEnabled({
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  } as never);

  expect(getUserMedia).not.toHaveBeenCalled();
});

it('warns when direct microphone access returns no audio tracks', async () => {
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStreamMock([]));

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  recordingContext.videoStream = new MediaStreamMock([{ kind: 'video' }]) as never;

  await attachMicrophoneAudioIfEnabled({
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  } as never);

  expect(loggerWarnMock).toHaveBeenCalledWith('Direct microphone stream returned no audio tracks');
});
