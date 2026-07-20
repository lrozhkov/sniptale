import { beforeEach, expect, it, vi } from 'vitest';

// State-machine proof: recorder failure rolls back already-created sources.
const { normalizeMultiSourceVideoStreamMock } = vi.hoisted(() => ({
  normalizeMultiSourceVideoStreamMock: vi.fn(),
}));

vi.mock('./normalize', () => ({
  normalizeMultiSourceVideoStream: normalizeMultiSourceVideoStreamMock,
}));
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  buildMicrophoneFilename,
  buildSourceFilename,
  createMicrophoneRecorder,
  createSourceRecorders,
  stopRecorderStreams,
} from './recorders';
import { createAudioStream, createStream, createTrackedStream } from './media-stream.test-support';

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supportedMimeTypes = new Set(['audio/webm']);
  static isTypeSupported(mimeType: string) {
    return FakeMediaRecorder.supportedMimeTypes.has(mimeType);
  }

  mimeType: string;
  readonly stream: MediaStream;

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }
}

function createSettings(
  microphoneEnabled: boolean,
  overrides: Partial<VideoRecordingSettings> = {}
): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    autoGainControl: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    echoCancellation: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled,
    microphoneGain: 1,
    noiseSuppression: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    ...overrides,
  };
}

function getOnlyAudioTrack(stream: MediaStream): MediaStreamTrack {
  const [track] = stream.getAudioTracks();
  if (!track) {
    throw new Error('Expected an audio track in the media stream fixture.');
  }
  return track;
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supportedMimeTypes = new Set(['audio/webm']);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(createAudioStream()),
    },
  });
});

it('builds stable source filenames and creates audio-only microphone recorders', async () => {
  const rawStream = createAudioStream();
  const rawTrack = getOnlyAudioTrack(rawStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(rawStream);
  expect(buildSourceFilename(1)).toContain('window-2.webm');
  expect(buildMicrophoneFilename()).toContain('microphone.webm');
  expect(await createMicrophoneRecorder('rec', createSettings(false))).toBeNull();

  const recorder = await createMicrophoneRecorder('rec', createSettings(true));

  expect(recorder?.recordingId).toBe('rec-window-1000');
  expect(recorder?.recorder.mimeType).toBe('audio/webm');
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.objectContaining({
        autoGainControl: false,
        deviceId: { exact: 'mic-1' },
        echoCancellation: false,
        noiseSuppression: true,
      }),
    })
  );
  stopRecorderStreams([recorder]);
  expect(rawTrack.stop).toHaveBeenCalledOnce();
});

it('routes multi-source microphone audio through software gain when requested', async () => {
  const rawStream = createAudioStream();
  const processedStream = createAudioStream();
  const rawTrack = getOnlyAudioTrack(rawStream);
  const processedTrack = getOnlyAudioTrack(processedStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(rawStream);
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const gainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const close = vi.fn().mockResolvedValue(undefined);
  const AudioContextMock = vi.fn(function MockAudioContext() {
    return {
      close,
      createGain: vi.fn(() => gainNode),
      createMediaStreamDestination: vi.fn(() => ({ stream: processedStream })),
      createMediaStreamSource: vi.fn(() => sourceNode),
    };
  });
  vi.stubGlobal('AudioContext', AudioContextMock);

  const recorder = await createMicrophoneRecorder(
    'rec',
    createSettings(true, { microphoneGain: 1.75 })
  );

  expect(gainNode.gain.value).toBe(1.75);
  expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
  expect(gainNode.connect).toHaveBeenCalledTimes(1);
  expect(FakeMediaRecorder.instances[0]?.stream).toBe(processedStream);

  stopRecorderStreams([recorder]);

  expect(processedTrack.stop).toHaveBeenCalledOnce();
  expect(rawTrack.stop).toHaveBeenCalledOnce();
  expect(sourceNode.disconnect).toHaveBeenCalledOnce();
  expect(gainNode.disconnect).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('stops the raw microphone stream when gain graph setup fails', async () => {
  const rawStream = createAudioStream();
  const rawTrack = getOnlyAudioTrack(rawStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(rawStream);
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function MockAudioContext() {
      throw new Error('audio graph failed');
    })
  );

  await expect(
    createMicrophoneRecorder('rec', createSettings(true, { microphoneGain: 1.25 }))
  ).rejects.toThrow('audio graph failed');

  expect(rawTrack.stop).toHaveBeenCalledOnce();
});

it('closes a partially created gain graph when node setup fails', async () => {
  const rawStream = createAudioStream();
  const rawTrack = getOnlyAudioTrack(rawStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(rawStream);
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function MockAudioContext() {
      return {
        close,
        createGain: vi.fn(() => {
          throw new Error('gain node failed');
        }),
        createMediaStreamDestination: vi.fn(),
        createMediaStreamSource: vi.fn(() => sourceNode),
      };
    })
  );

  await expect(
    createMicrophoneRecorder('rec', createSettings(true, { microphoneGain: 1.25 }))
  ).rejects.toThrow('gain node failed');

  expect(sourceNode.disconnect).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(rawTrack.stop).toHaveBeenCalledOnce();
});

it('releases processed microphone streams when recorder creation fails', async () => {
  const rawStream = createAudioStream();
  const processedStream = createAudioStream();
  const rawTrack = getOnlyAudioTrack(rawStream);
  const processedTrack = getOnlyAudioTrack(processedStream);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(rawStream);
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const gainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function MockAudioContext() {
      return {
        close,
        createGain: vi.fn(() => gainNode),
        createMediaStreamDestination: vi.fn(() => ({ stream: processedStream })),
        createMediaStreamSource: vi.fn(() => sourceNode),
      };
    })
  );
  vi.stubGlobal(
    'MediaRecorder',
    Object.assign(
      vi.fn(function MockMediaRecorder() {
        throw new Error('recorder failed');
      }),
      { isTypeSupported: vi.fn(() => true) }
    )
  );

  await expect(
    createMicrophoneRecorder('rec', createSettings(true, { microphoneGain: 1.25 }))
  ).rejects.toThrow('recorder failed');

  expect(processedTrack.stop).toHaveBeenCalledOnce();
  expect(rawTrack.stop).toHaveBeenCalledOnce();
  expect(sourceNode.disconnect).toHaveBeenCalledOnce();
  expect(gainNode.disconnect).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('rolls back already normalized source recorders when a later source fails', async () => {
  const normalizedStream = createTrackedStream();

  normalizeMultiSourceVideoStreamMock
    .mockResolvedValueOnce({ dimensions: { height: 720, width: 1280 }, stream: normalizedStream })
    .mockRejectedValueOnce(new Error('normalize failed'));

  await expect(
    createSourceRecorders({
      baseRecordingId: 'rec',
      settings: createSettings(false),
      sources: [
        { label: 'Window 1', stream: createStream(1280, 720) },
        { label: 'Window 2', stream: createStream(1280, 720) },
      ],
    })
  ).rejects.toThrow('normalize failed');

  expect(normalizedStream.track.stop).toHaveBeenCalled();
});

it('stops a normalized source stream when recorder construction fails', async () => {
  const normalizedStream = createTrackedStream();
  normalizeMultiSourceVideoStreamMock.mockResolvedValueOnce({
    dimensions: { height: 720, width: 1280 },
    stream: normalizedStream,
  });
  vi.stubGlobal(
    'MediaRecorder',
    Object.assign(
      vi.fn(function MockMediaRecorder() {
        throw new Error('source recorder failed');
      }),
      { isTypeSupported: vi.fn(() => true) }
    )
  );

  await expect(
    createSourceRecorders({
      baseRecordingId: 'rec',
      settings: createSettings(false),
      sources: [{ label: 'Window 1', stream: createStream(1280, 720) }],
    })
  ).rejects.toThrow('source recorder failed');

  expect(normalizedStream.track.stop).toHaveBeenCalled();
});
