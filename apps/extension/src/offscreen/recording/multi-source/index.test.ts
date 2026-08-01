import { beforeEach, expect, it, vi } from 'vitest';
import {
  createAudioStream,
  createConfigurableVideoStream,
  createStream,
  createTrackedStream,
} from './media-stream.test-support';
import { createDeferred, createSettings, FakeMediaRecorder } from './index.test-support';

const {
  consumeDesktopStreamsMock,
  disposeMultiSourceDesktopMediaMock,
  normalizeMultiSourceVideoStreamMock,
  createRecordingStagingCoordinatorMock,
  completionOutboxState,
  saveRecordingSafelyMock,
  saveVideoProjectMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  consumeDesktopStreamsMock: vi.fn(),
  disposeMultiSourceDesktopMediaMock: vi.fn(),
  normalizeMultiSourceVideoStreamMock: vi.fn(),
  createRecordingStagingCoordinatorMock: vi.fn(),
  completionOutboxState: { result: null as unknown },
  saveRecordingSafelyMock: vi.fn(),
  saveVideoProjectMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/staging')>()),
  createRecordingStagingCoordinator: createRecordingStagingCoordinatorMock,
}));

vi.mock('../setup/desktop-media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../setup/desktop-media')>();
  return {
    ...actual,
    consumeDesktopStreams: consumeDesktopStreamsMock,
    disposeMultiSourceDesktopMedia: disposeMultiSourceDesktopMediaMock,
  };
});

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: normalizeMultiSourceVideoStreamMock,
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
    saveRecordingsBatchWithCompletionSafely: saveRecordingSafelyMock,
  };
});

vi.mock(
  '../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/recordings/completion-outbox')
    >()),
    readVideoRecordingCompletionOutbox: vi.fn(async () => completionOutboxState.result),
    removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
    updateVideoRecordingCompletionOutbox: vi.fn(async (result: unknown) => {
      completionOutboxState.result = result;
    }),
  })
);

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
import { setActiveMultiSourceSession } from './state';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  completionOutboxState.result = null;
  createRecordingStagingCoordinatorMock.mockImplementation(async () =>
    createRecordingStagingCoordinatorTestDouble()
  );
  setActiveMultiSourceSession(null);
  FakeMediaRecorder.autoEmitStart = true;
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
  saveRecordingSafelyMock.mockImplementation(async (_inputs: unknown, completion: unknown) => {
    completionOutboxState.result = completion;
  });
  saveVideoProjectMock.mockResolvedValue(undefined);
  normalizeMultiSourceVideoStreamMock.mockImplementation((stream: MediaStream) =>
    Promise.resolve({
      dimensions: stream.getVideoTracks()[0]?.getSettings() ?? { height: 720, width: 1280 },
      frameRate: 30,
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

function findRuntimeMessages(type: string) {
  return sendRuntimeMessageMock.mock.calls.filter(([message]) => message.type === type);
}

it('publishes started only after every required recorder emits its native start event', async () => {
  FakeMediaRecorder.autoEmitStart = false;

  const start = startMultiSourceRecording({
    recordingId: 'aggregate-start',
    settings: createSettings(),
  });
  await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(3));

  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(0);
  FakeMediaRecorder.instances[0]?.emitStart();
  FakeMediaRecorder.instances[1]?.emitStart();
  await Promise.resolve();
  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(0);

  FakeMediaRecorder.instances[2]?.emitStart();
  await start;

  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(1);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.startTimeslices[0] === 0)).toBe(
    true
  );
  await stopMultiSourceRecording(true);
});

it('fails aggregate start when one required recorder errors before activation', async () => {
  FakeMediaRecorder.autoEmitStart = false;
  const start = startMultiSourceRecording({
    recordingId: 'failed-start',
    settings: createSettings(),
  });
  const startError = start.catch((error: unknown) => error);
  await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(3));

  FakeMediaRecorder.instances[0]?.emitStart();
  FakeMediaRecorder.instances[1]?.onerror?.(
    Object.assign(new Event('error'), { error: new Error('source encoder failed') })
  );

  expect(await startError).toEqual(new Error('source encoder failed'));
  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);
  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(0);
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
});

it('fails aggregate start when a required recorder stops before activation', async () => {
  FakeMediaRecorder.autoEmitStart = false;
  const start = startMultiSourceRecording({
    recordingId: 'stopped-start',
    settings: createSettings(),
  });
  const startError = start.catch((error: unknown) => error);
  await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(3));

  FakeMediaRecorder.instances[0]?.emitStart();
  FakeMediaRecorder.instances[1]?.emitUnexpectedStop();

  expect(await startError).toEqual(
    new Error('Recording stopped-start-window-2 produced no media bytes.')
  );
  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(0);
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
});

it('cancels stop-before-activation without publishing or saving a recording', async () => {
  FakeMediaRecorder.autoEmitStart = false;
  const start = startMultiSourceRecording({
    recordingId: 'cancel-start',
    settings: createSettings(),
  });
  await vi.waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(3));

  await stopMultiSourceRecording();
  await expect(start).resolves.toBeUndefined();

  expect(hasActiveMultiSourceRecording()).toBe(false);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'inactive')).toBe(true);
  expect(findRuntimeMessages('OFFSCREEN_RECORDING_STARTED')).toHaveLength(0);
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});

it('starts all prepared source recorders and finalizes video plus separate microphone assets', async () => {
  await startMultiSourceRecording({ recordingId: 'rec', settings: createSettings() });

  expect(FakeMediaRecorder.instances).toHaveLength(3);
  expect(FakeMediaRecorder.instances.every((recorder) => recorder.state === 'recording')).toBe(
    true
  );

  await stopMultiSourceRecording();

  expect(saveRecordingSafelyMock).toHaveBeenCalledOnce();
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        filename: expect.stringContaining('microphone.webm'),
        id: 'rec-window-1000',
      }),
    ]),
    {
      primaryRecordingId: 'rec-window-1',
      projectId: null,
      recordingId: 'rec',
    }
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
    expect.objectContaining({
      primaryRecordingId: 'rec-window-1',
      projectId: expect.any(String),
      recordingId: 'rec',
    })
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
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_ERROR',
    error: 'source recorder failed',
    phase: 'runtime',
    recordingId: 'failure',
  });

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
    frameRate: number;
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
  resolveFirstNormalization({
    dimensions: { height: 720, width: 1280 },
    frameRate: 30,
    stream: firstStream,
  });

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
    .mockResolvedValueOnce(
      createConfigurableVideoStream({
        settings: { frameRate: 30, height: 180, width: 320 },
      })
    );

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

it('creates a grouped project for later post-record editing when auto-open is disabled', async () => {
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
    expect.arrayContaining([
      expect.objectContaining({
        filename: expect.stringContaining('window-1.webm'),
        id: 'no-editor-window-1',
      }),
      expect.objectContaining({
        filename: expect.stringContaining('window-2.webm'),
        id: 'no-editor-window-2',
      }),
    ]),
    {
      primaryRecordingId: 'no-editor-window-1',
      projectId: null,
      recordingId: 'no-editor',
    }
  );
  expect(saveVideoProjectMock).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      primaryRecordingId: 'no-editor-window-1',
      projectId: expect.any(String),
      recordingId: 'no-editor',
    })
  );
});

it('resolves stop requests when there is no active multi-source session', async () => {
  await expect(stopMultiSourceRecording()).resolves.toBeUndefined();

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
});
