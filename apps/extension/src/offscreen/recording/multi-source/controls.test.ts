import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createAudioStream, createTrackedStream } from './media-stream.test-support';

const { consumeDesktopStreamsMock, normalizeMultiSourceVideoStreamMock } = vi.hoisted(() => ({
  consumeDesktopStreamsMock: vi.fn(),
  normalizeMultiSourceVideoStreamMock: vi.fn(),
}));

vi.mock('../setup/desktop-media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../setup/desktop-media')>();
  return {
    ...actual,
    consumeDesktopStreams: consumeDesktopStreamsMock,
    disposeMultiSourceDesktopMedia: vi.fn(),
  };
});

vi.mock('./normalize', () => ({
  normalizeMultiSourceVideoStream: normalizeMultiSourceVideoStreamMock,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/runtime-messaging')>();
  return {
    ...actual,
    sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true }),
  };
});

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: { error?: Error }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = 'inactive';

  constructor(
    readonly stream: MediaStream,
    options: MediaRecorderOptions
  ) {
    this.mimeType = options.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }

  pause() {
    this.state = 'paused';
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) });
  }

  resume() {
    this.state = 'recording';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

function createStream(video = true): MediaStream {
  const track = { getSettings: () => ({ height: 720, width: 1280 }), stop: vi.fn() };
  return {
    getAudioTracks: () => (video ? [] : [track]),
    getTracks: () => [track],
    getVideoTracks: () => (video ? [track] : []),
  } as unknown as MediaStream;
}

function createSettings() {
  return {
    autoFadeDelay: 3,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(createStream(false)) },
  });
  normalizeMultiSourceVideoStreamMock.mockImplementation((stream: MediaStream) =>
    Promise.resolve({ dimensions: { height: 720, width: 1280 }, stream })
  );
  consumeDesktopStreamsMock.mockReturnValue([
    { label: 'Window 1', stream: createStream() },
    { label: 'Window 2', stream: createStream() },
  ]);
});

it('handles idle stop and pause resume requests without mutating recorders', async () => {
  const {
    hasActiveMultiSourceRecording,
    pauseMultiSourceRecording,
    resumeMultiSourceRecording,
    stopMultiSourceRecording,
  } = await import('.');

  expect(hasActiveMultiSourceRecording()).toBe(false);
  pauseMultiSourceRecording();
  resumeMultiSourceRecording();
  await expect(stopMultiSourceRecording()).resolves.toBeUndefined();
}, 15_000);

it('pauses and resumes active source and microphone recorders', async () => {
  const {
    hasActiveMultiSourceRecording,
    pauseMultiSourceRecording,
    resumeMultiSourceRecording,
    startMultiSourceRecording,
    stopMultiSourceRecording,
  } = await import('.');

  await startMultiSourceRecording({ recordingId: 'rec-pause', settings: createSettings() });
  expect(hasActiveMultiSourceRecording()).toBe(true);
  pauseMultiSourceRecording();
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'paused')).toBe(true);
  resumeMultiSourceRecording();
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'recording')).toBe(
    true
  );
  await stopMultiSourceRecording(true);
  expect(hasActiveMultiSourceRecording()).toBe(false);
});

it('treats active multi-source recorder errors as terminal session events', async () => {
  const { hasActiveMultiSourceRecording, startMultiSourceRecording, stopMultiSourceRecording } =
    await import('.');
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockResolvedValueOnce(createStream(false))
    .mockResolvedValueOnce(createStream(true));

  await startMultiSourceRecording({
    recordingId: 'rec-webcam-pause',
    settings: { ...createSettings(), webcamEnabled: true },
  });

  expect(FakeMediaRecorder.instances).toHaveLength(4);
  FakeMediaRecorder.instances[0]?.onerror?.({ error: new Error('source recorder failed') });

  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);
  expect(
    FakeMediaRecorder.instances.every((recorder) => {
      const [track] = recorder.stream.getTracks() as unknown as Array<{
        stop: ReturnType<typeof vi.fn>;
      }>;
      return (track?.stop.mock.calls.length ?? 0) > 0;
    })
  ).toBe(true);
  await stopMultiSourceRecording(true);
});

it('toggles active microphone and webcam tracks for a multi-source session', async () => {
  const { setSessionMediaEnabled } = await import('./controls');
  const microphoneStream = createAudioStream();
  const webcamStream = createTrackedStream();
  const [microphoneTrack] = microphoneStream.getAudioTracks();
  if (!microphoneTrack) {
    throw new Error('Expected an audio track in the microphone fixture.');
  }

  setSessionMediaEnabled(
    {
      audioRecorder: {
        chunks: [],
        label: 'Microphone',
        recorder: {} as MediaRecorder,
        recordingId: 'rec-mic',
        sourceIndex: 0,
        stream: microphoneStream,
        trackSettings: {},
      },
      durationTimer: null,
      recorders: [],
      recordingId: 'rec',
      settings: createSettings(),
      startedAt: 0,
      stopReject: null,
      stopPromise: null,
      stopResolve: null,
      webcamRecorder: {
        chunks: [],
        filenameSuffix: 'webcam',
        kind: 'webcam',
        recorder: {} as MediaRecorder,
        recordingId: 'rec-webcam',
        stream: webcamStream,
        trackSettings: {},
      },
    },
    { microphoneEnabled: false, webcamEnabled: false }
  );

  expect(microphoneTrack.enabled).toBe(false);
  expect(webcamStream.track.enabled).toBe(false);
});

it('leaves webcam tracks unchanged when only microphone settings change', async () => {
  const { setSessionMediaEnabled } = await import('./controls');
  const webcamStream = createTrackedStream();

  setSessionMediaEnabled(
    {
      audioRecorder: null,
      durationTimer: null,
      recorders: [],
      recordingId: 'rec',
      settings: createSettings(),
      startedAt: 0,
      stopReject: null,
      stopPromise: null,
      stopResolve: null,
      webcamRecorder: {
        chunks: [],
        filenameSuffix: 'webcam',
        kind: 'webcam',
        recorder: {} as MediaRecorder,
        recordingId: 'rec-webcam',
        stream: webcamStream,
        trackSettings: {},
      },
    },
    { microphoneEnabled: false }
  );

  expect(webcamStream.track.enabled).toBe(true);
});

it('leaves microphone tracks unchanged when only webcam settings change', async () => {
  const { setSessionMediaEnabled } = await import('./controls');
  const microphoneStream = createAudioStream();
  const [microphoneTrack] = microphoneStream.getAudioTracks();
  if (!microphoneTrack) {
    throw new Error('Expected an audio track in the microphone fixture.');
  }

  setSessionMediaEnabled(
    {
      audioRecorder: {
        chunks: [],
        label: 'Microphone',
        recorder: {} as MediaRecorder,
        recordingId: 'rec-mic',
        sourceIndex: 0,
        stream: microphoneStream,
        trackSettings: {},
      },
      durationTimer: null,
      recorders: [],
      recordingId: 'rec',
      settings: createSettings(),
      startedAt: 0,
      stopReject: null,
      stopPromise: null,
      stopResolve: null,
      webcamRecorder: null,
    },
    { webcamEnabled: false }
  );

  expect(microphoneTrack.enabled).toBe(true);
});

it('ignores live media patches when no multi-source session exists', async () => {
  const { setSessionMediaEnabled } = await import('./controls');

  expect(() =>
    setSessionMediaEnabled(null, { microphoneEnabled: false, webcamEnabled: false })
  ).not.toThrow();
});
