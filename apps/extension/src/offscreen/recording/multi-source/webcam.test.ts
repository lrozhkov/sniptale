import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createAudioStream, createStream, createTrackedStream } from './media-stream.test-support';

const {
  consumeDesktopStreamsMock,
  normalizeMultiSourceVideoStreamMock,
  saveRecordingSafelyMock,
  saveVideoProjectMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  consumeDesktopStreamsMock: vi.fn(),
  normalizeMultiSourceVideoStreamMock: vi.fn(),
  saveRecordingSafelyMock: vi.fn(),
  saveVideoProjectMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
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

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProjectMock,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflows/media-hub/store')>();
  return {
    ...actual,
    saveRecordingSafely: saveRecordingSafelyMock,
  };
});

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/runtime-messaging')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

import { startMultiSourceRecording, stopMultiSourceRecording } from '.';

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

  requestData() {
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) });
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

function createSettings() {
  return {
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  saveRecordingSafelyMock.mockResolvedValue(undefined);
  saveVideoProjectMock.mockResolvedValue(undefined);
  normalizeMultiSourceVideoStreamMock.mockImplementation((stream: MediaStream) =>
    Promise.resolve({
      dimensions: stream.getVideoTracks()[0]?.getSettings() ?? { height: 720, width: 1280 },
      stream,
    })
  );
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(createAudioStream()),
    },
  });
  consumeDesktopStreamsMock.mockReturnValue([
    { label: 'Window 1', stream: createStream(1280, 720) },
    { label: 'Window 2', stream: createStream(1024, 768) },
  ]);
});

it('finalizes source, microphone, and webcam recorders into one editor project', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockResolvedValueOnce(createAudioStream())
    .mockResolvedValueOnce(createStream(640, 360));

  await startMultiSourceRecording({ recordingId: 'rec', settings: createSettings() });
  await stopMultiSourceRecording();

  expect(FakeMediaRecorder.instances).toHaveLength(4);
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-webcam',
    expect.any(Blob),
    expect.stringContaining('webcam.webm')
  );
  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assets: expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ height: 360, width: 640 }),
          name: expect.stringContaining('webcam.webm'),
          type: 'RECORDING',
        }),
      ]),
    }),
    { baseRevision: null }
  );
});

it('saves webcam recordings without creating a project when editor-open is disabled', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(createStream(640, 360));

  await startMultiSourceRecording({
    recordingId: 'no-editor',
    settings: {
      ...createSettings(),
      microphoneEnabled: false,
      openEditorAfterRecording: false,
    },
  });
  await stopMultiSourceRecording();

  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'no-editor-webcam',
    expect.any(Blob),
    expect.stringContaining('webcam.webm')
  );
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});

it('discards webcam sessions without saving outputs', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(createStream(640, 360));

  await startMultiSourceRecording({
    recordingId: 'discard',
    settings: { ...createSettings(), microphoneEnabled: false },
  });
  await stopMultiSourceRecording(true);

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});

it('rolls back prepared streams when webcam acquisition fails', async () => {
  const firstStream = createTrackedStream();
  const secondStream = createTrackedStream();
  consumeDesktopStreamsMock.mockReturnValueOnce([
    { label: 'Window 1', stream: firstStream },
    { label: 'Window 2', stream: secondStream },
  ]);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('webcam denied'));

  await expect(
    startMultiSourceRecording({
      recordingId: 'rec',
      settings: { ...createSettings(), microphoneEnabled: false },
    })
  ).rejects.toThrow('webcam denied');

  expect(firstStream.track.stop).toHaveBeenCalled();
  expect(secondStream.track.stop).toHaveBeenCalled();
});

it('attaches an error handler to the webcam recorder', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockResolvedValueOnce(createAudioStream())
    .mockResolvedValueOnce(createStream(640, 360));

  await startMultiSourceRecording({ recordingId: 'rec-error', settings: createSettings() });
  FakeMediaRecorder.instances.at(-1)?.onerror?.({ error: new Error('webcam recorder failed') });
  FakeMediaRecorder.instances.at(-1)?.onerror?.({});

  await expect(stopMultiSourceRecording(true)).resolves.toBeUndefined();
});
