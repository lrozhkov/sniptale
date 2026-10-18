import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import {
  buildMicrophoneFilename,
  buildSourceFilename,
  createMicrophoneRecorder,
  createSourceRecorders,
  stopRecorderStreams,
} from './recorders';
import { createAudioStream, createStream } from './media-stream.test-support';
import { createFixedVideoOutputStream } from '../stream/fixed-video-output';

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: vi.fn(async (stream: MediaStream) => ({
    dimensions: stream.getVideoTracks()[0]?.getSettings() ?? { height: 720, width: 1280 },
    frameRate: 30,
    stream,
  })),
}));

class MediaRecorderMock {
  static constructorCount = 0;
  static isTypeSupported = vi.fn(() => true);
  static throwAt: number | null = null;
  mimeType: string;
  ondataavailable = null;
  onerror = null;
  onstart = null;
  onstop = null;
  state: RecordingState = 'inactive';

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    MediaRecorderMock.constructorCount += 1;
    if (MediaRecorderMock.constructorCount === MediaRecorderMock.throwAt) {
      throw new Error('encoder construction failed');
    }
    this.mimeType = options.mimeType ?? '';
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  MediaRecorderMock.constructorCount = 0;
  MediaRecorderMock.throwAt = null;
  MediaRecorderMock.isTypeSupported.mockReturnValue(true);
  vi.stubGlobal('MediaRecorder', MediaRecorderMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('builds container-aware filenames without using a byte accumulator', () => {
  expect(buildSourceFilename(1, 'video/mp4;codecs=avc1.640028')).toContain('window-2.mp4');
  expect(buildMicrophoneFilename()).toContain('microphone.webm');
});

it('creates independently staged normalized source artifacts', async () => {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  const recorders = await createSourceRecorders({
    baseRecordingId: 'rec',
    coordinator,
    settings: DEFAULT_VIDEO_SETTINGS,
    sources: [
      { label: 'A', stream: createStream(1280, 720) },
      { label: 'B', stream: createStream(1920, 1080) },
    ],
  });

  expect(recorders.map((recorder) => recorder.recordingId)).toEqual([
    'rec-window-1',
    'rec-window-2',
  ]);
  expect(coordinator.openArtifact).toHaveBeenCalledTimes(2);
});

it('creates and releases a separately staged microphone artifact', async () => {
  const audio = createAudioStream();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(audio) },
  });
  const recorder = await createMicrophoneRecorder(
    'rec',
    { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true },
    createRecordingStagingCoordinatorTestDouble()
  );
  expect(recorder?.recordingId).toBe('rec-window-1000');

  stopRecorderStreams([recorder]);
  expect(audio.getTracks()[0]?.stop).toHaveBeenCalledOnce();
});

it('rejects a source without video before creating an encoder', async () => {
  await expect(
    createSourceRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: DEFAULT_VIDEO_SETTINGS,
      sources: [{ label: 'audio-only', stream: createAudioStream() }],
    })
  ).rejects.toThrow('missing a video track');

  expect(MediaRecorderMock.constructorCount).toBe(0);
});

it('stops every normalized source when a later encoder cannot be constructed', async () => {
  const first = createStream(1280, 720);
  const second = createStream(1920, 1080);
  MediaRecorderMock.throwAt = 2;

  await expect(
    createSourceRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: DEFAULT_VIDEO_SETTINGS,
      sources: [
        { label: 'first', stream: first },
        { label: 'second', stream: second },
      ],
    })
  ).rejects.toThrow('encoder construction failed');

  expect(first.getVideoTracks()[0]?.stop).toHaveBeenCalledOnce();
  expect(second.getVideoTracks()[0]?.stop).toHaveBeenCalledOnce();
  expect(createFixedVideoOutputStream).toHaveBeenCalledTimes(2);
});

it('does not request microphone media when the microphone is disabled', async () => {
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  await expect(
    createMicrophoneRecorder(
      'rec',
      { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: false },
      createRecordingStagingCoordinatorTestDouble()
    )
  ).resolves.toBeNull();
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('stops the raw microphone stream when encoder construction fails', async () => {
  const audio = createAudioStream();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(audio) },
  });
  MediaRecorderMock.throwAt = 1;

  await expect(
    createMicrophoneRecorder(
      'rec',
      { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true },
      createRecordingStagingCoordinatorTestDouble()
    )
  ).rejects.toThrow('encoder construction failed');
  expect(audio.getTracks()[0]?.stop).toHaveBeenCalledOnce();
});

it('owns and releases the complete gain-processing graph', async () => {
  const raw = createAudioStream();
  const processed = createAudioStream();
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const gainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } };
  const close = vi.fn().mockResolvedValue(undefined);
  class AudioContextMock {
    createGain = vi.fn(() => gainNode);
    createMediaStreamDestination = vi.fn(() => ({ stream: processed }));
    createMediaStreamSource = vi.fn(() => sourceNode);
    close = close;
  }
  vi.stubGlobal('AudioContext', AudioContextMock);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(raw) },
  });

  const recorder = await createMicrophoneRecorder(
    'rec',
    { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true, microphoneGain: 2 },
    createRecordingStagingCoordinatorTestDouble()
  );
  stopRecorderStreams([recorder]);

  expect(gainNode.gain.value).toBe(2);
  expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
  expect(gainNode.connect).toHaveBeenCalledOnce();
  expect(sourceNode.disconnect).toHaveBeenCalledOnce();
  expect(gainNode.disconnect).toHaveBeenCalledOnce();
  expect(raw.getTracks()[0]?.stop).toHaveBeenCalledOnce();
  expect(processed.getTracks()[0]?.stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('rolls back a partially created gain-processing graph', async () => {
  const raw = createAudioStream();
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  class AudioContextMock {
    createGain = vi.fn(() => {
      throw new Error('gain unavailable');
    });
    createMediaStreamSource = vi.fn(() => sourceNode);
    close = close;
  }
  vi.stubGlobal('AudioContext', AudioContextMock);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(raw) },
  });

  await expect(
    createMicrophoneRecorder(
      'rec',
      { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true, microphoneGain: 2 },
      createRecordingStagingCoordinatorTestDouble()
    )
  ).rejects.toThrow('gain unavailable');

  expect(sourceNode.disconnect).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(raw.getTracks()[0]?.stop).toHaveBeenCalledOnce();
});
