import { beforeEach, expect, it, vi } from 'vitest';
import { createAudioStream, createStream, createTrackedStream } from './media-stream.test-support';
import { createDeferred, createSettings, FakeMediaRecorder } from './index.test-support';

const {
  consumeDesktopStreamsMock,
  disposeMultiSourceDesktopMediaMock,
  normalizeMultiSourceVideoStreamMock,
  saveRecordingSafelyMock,
  saveVideoProjectMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  consumeDesktopStreamsMock: vi.fn(),
  disposeMultiSourceDesktopMediaMock: vi.fn(),
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
    disposeMultiSourceDesktopMedia: disposeMultiSourceDesktopMediaMock,
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

import {
  cancelPendingMultiSourceRecordingStart,
  hasActiveMultiSourceRecording,
  startMultiSourceRecording,
  stopMultiSourceRecording,
  updateMultiSourceRecordingSettings,
} from '.';

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

it('starts all prepared source recorders and finalizes video plus separate microphone assets', async () => {
  await startMultiSourceRecording({ recordingId: 'rec', settings: createSettings() });

  expect(FakeMediaRecorder.instances).toHaveLength(3);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'recording')).toBe(
    true
  );

  await stopMultiSourceRecording();

  expect(saveRecordingSafelyMock).toHaveBeenCalledTimes(3);
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-window-1000',
    expect.any(Blob),
    expect.stringContaining('microphone.webm')
  );
  expect(saveVideoProjectMock).toHaveBeenCalledOnce();
  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assets: expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ height: 720, width: 1280 }),
          name: expect.stringContaining('window-1.webm'),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ hasAudio: true, mimeType: 'audio/webm' }),
          name: expect.stringContaining('microphone.webm'),
          type: 'AUDIO',
        }),
      ]),
    }),
    { baseRevision: null }
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: expect.any(String), recordingId: 'rec-window-1' })
  );
});

it('rejects a second start while a multi-source session is active', async () => {
  await startMultiSourceRecording({ recordingId: 'active', settings: createSettings() });

  await expect(
    startMultiSourceRecording({ recordingId: 'duplicate', settings: createSettings() })
  ).rejects.toThrow('already active');

  await stopMultiSourceRecording(true);
});

it('tears down an active session on recorder failure and ignores its stale error handler', async () => {
  await startMultiSourceRecording({ recordingId: 'failure', settings: createSettings() });
  const errorHandler = FakeMediaRecorder.instances[0]?.onerror;

  errorHandler?.(Object.assign(new Event('error'), { error: new Error('source recorder failed') }));

  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);

  expect(() => errorHandler?.(new Event('error'))).not.toThrow();
});

it('rejects starts without enough prepared sources and rolls back desktop media', async () => {
  consumeDesktopStreamsMock.mockReturnValueOnce([
    { label: 'Window 1', stream: createStream(1, 1) },
  ]);

  await expect(
    startMultiSourceRecording({ recordingId: 'rec', settings: createSettings() })
  ).rejects.toThrow('at least two prepared sources');

  expect(disposeMultiSourceDesktopMediaMock).toHaveBeenCalledOnce();
});

it('stops prepared source streams when microphone acquisition fails during start', async () => {
  const firstStream = createTrackedStream();
  const secondStream = createTrackedStream();
  consumeDesktopStreamsMock.mockReturnValueOnce([
    { label: 'Window 1', stream: firstStream },
    { label: 'Window 2', stream: secondStream },
  ]);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('mic denied'));

  await expect(
    startMultiSourceRecording({ recordingId: 'rec', settings: createSettings() })
  ).rejects.toThrow('mic denied');

  expect(firstStream.track.stop).toHaveBeenCalled();
  expect(secondStream.track.stop).toHaveBeenCalled();
});

it('cancels a delayed multi-source start before recorder activation', async () => {
  let resolveFirstNormalization!: (value: {
    dimensions: { height: number; width: number };
    stream: MediaStream;
  }) => void;
  const firstStream = createTrackedStream();
  const secondStream = createTrackedStream();
  consumeDesktopStreamsMock.mockReturnValueOnce([
    { label: 'Window 1', stream: firstStream },
    { label: 'Window 2', stream: secondStream },
  ]);
  normalizeMultiSourceVideoStreamMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirstNormalization = resolve;
    })
  );

  const start = startMultiSourceRecording({ recordingId: 'cancelled', settings: createSettings() });
  await vi.waitFor(() => expect(normalizeMultiSourceVideoStreamMock).toHaveBeenCalledOnce());
  cancelPendingMultiSourceRecordingStart();
  resolveFirstNormalization({ dimensions: { height: 720, width: 1280 }, stream: firstStream });

  await expect(start).resolves.toBeUndefined();
  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);
  expect(firstStream.track.stop).toHaveBeenCalled();
  expect(secondStream.track.stop).toHaveBeenCalled();
});

it('disposes microphone media that resolves after start cancellation', async () => {
  const microphoneStream = createAudioStream();
  const microphone = createDeferred<MediaStream>();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(microphone.promise);
  const start = startMultiSourceRecording({
    recordingId: 'cancelled-microphone',
    settings: createSettings(),
  });
  await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
  cancelPendingMultiSourceRecordingStart();
  microphone.resolve(microphoneStream);
  await expect(start).resolves.toBeUndefined();
  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(microphoneStream.getAudioTracks()[0]?.stop).toHaveBeenCalled();
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);
});

it('can discard a mic-free multi-source session without saving outputs', async () => {
  await startMultiSourceRecording({
    recordingId: 'discard',
    settings: {
      ...createSettings(),
      microphoneEnabled: false,
      openEditorAfterRecording: false,
    },
  });
  await stopMultiSourceRecording(true);

  expect(FakeMediaRecorder.instances).toHaveLength(2);
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});

it('updates live microphone and webcam track state on the active session', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockResolvedValueOnce(createAudioStream())
    .mockResolvedValueOnce(createStream(320, 180));

  await startMultiSourceRecording({
    recordingId: 'live-settings',
    settings: { ...createSettings(), webcamEnabled: true },
  });

  updateMultiSourceRecordingSettings({ microphoneEnabled: false, webcamEnabled: false });

  const audioRecorder = FakeMediaRecorder.instances.find(
    (recorder) => recorder.stream.getAudioTracks().length > 0
  );
  const webcamRecorder = FakeMediaRecorder.instances.at(-1);
  expect(audioRecorder?.stream.getAudioTracks()[0]?.enabled).toBe(false);
  expect(webcamRecorder?.stream.getVideoTracks()[0]?.enabled).toBe(false);

  await stopMultiSourceRecording(true);
});

it('finalizes mic-free sessions without creating an editor project when disabled', async () => {
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
    'no-editor-window-1',
    expect.any(Blob),
    expect.stringContaining('window-1.webm')
  );
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'no-editor-window-2',
    expect.any(Blob),
    expect.stringContaining('window-2.webm')
  );
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'no-editor-window-1' })
  );
});

it('resolves stop requests when there is no active multi-source session', async () => {
  await expect(stopMultiSourceRecording()).resolves.toBeUndefined();

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});
