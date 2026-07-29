import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  durationTrackerMock,
  finalizeRecordingBootstrapMock,
  handleRecordingStartErrorMock,
  initializeRecordingSessionMock,
  initializeSidecarRecordersMock,
  prepareRecordingStreamMock,
  recordingContextMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  durationTrackerMock: { publishDuration: vi.fn() },
  finalizeRecordingBootstrapMock: vi.fn(),
  handleRecordingStartErrorMock: vi.fn((error: unknown) => error),
  initializeRecordingSessionMock: vi.fn(() => 'recording-1'),
  initializeSidecarRecordersMock: vi.fn(),
  prepareRecordingStreamMock: vi.fn(),
  recordingContextMock: {
    bindStreamInstance: vi.fn(),
    currentRecordingId: 'recording-1' as string | null,
    durationTracker: { publishDuration: vi.fn() },
    lifecycleState: 'starting' as 'idle' | 'starting' | 'recording' | 'stopping',
    sourceVideoHeight: null as number | null,
    sourceVideoWidth: null as number | null,
    tabOutputGeometry: null as unknown,
  },
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('./context', () => ({
  RecordingStopOutcome: undefined,
  recordingContext: recordingContextMock,
}));
vi.mock('./setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./setup')>()),
  prepareRecordingStream: prepareRecordingStreamMock,
}));
vi.mock('./sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sidecar')>()),
  initializeSidecarRecorders: initializeSidecarRecordersMock,
}));
vi.mock('./start/cleanup', () => ({ cleanupResources: cleanupResourcesMock }));
vi.mock('./start/recorder', () => ({ finalizeRecordingBootstrap: finalizeRecordingBootstrapMock }));
vi.mock('./start/session', () => ({
  handleRecordingStartError: handleRecordingStartErrorMock,
  initializeRecordingSession: initializeRecordingSessionMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from './start/index';
import { createSettings } from './start/helpers.test-support';
import { allowRecordingBegin, cancelRecordingBegin } from './start/gate';

const prepared = {
  cursorCaptureMode: null,
  rawTrackSettings: { width: 1280, height: 720, frameRate: 30 },
  rawVideoHeight: 720,
  rawVideoWidth: 1280,
  tabOutputGeometry: null,
  trackSettings: { width: 1280, height: 720, frameRate: 30 },
};
const messaging = { sendRuntimeMessage: sendRuntimeMessageMock };

beforeEach(() => {
  vi.clearAllMocks();
  recordingContextMock.currentRecordingId = 'recording-1';
  recordingContextMock.durationTracker = durationTrackerMock;
  recordingContextMock.lifecycleState = 'starting';
  prepareRecordingStreamMock.mockResolvedValue(prepared);
  cleanupResourcesMock.mockImplementation(() => cancelRecordingBegin());
  sendRuntimeMessageMock.mockImplementation(
    async (message: { generation: number; recordingId: string; streamInstanceId: string }) => {
      allowRecordingBegin({
        generation: message.generation,
        recordingId: message.recordingId,
        streamInstanceId: message.streamInstanceId,
      });
      return { success: true, result: 'ALLOW' };
    }
  );
});

afterEach(() => {
  cancelRecordingBegin();
  vi.useRealTimers();
});

it('announces raw source metadata and starts only after background ALLOW', async () => {
  const surface = {
    presetId: 'preset-1',
    target: 'viewport' as const,
    width: 1280,
    height: 720,
  };

  await startRecording(
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      settings: createSettings(),
      streamId: 'stream-1',
      surface,
    },
    messaging
  );

  expect(prepareRecordingStreamMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    settings: expect.any(Object),
    streamId: 'stream-1',
    surface,
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'OFFSCREEN_SOURCE_READY',
      generation: 3,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      videoWidth: 1280,
      videoHeight: 720,
      trackSettings: { width: 1280, height: 720, frameRate: 30 },
    })
  );
  expect(finalizeRecordingBootstrapMock).toHaveBeenCalledOnce();
});

it('survives the supported ten-second countdown before background activation', async () => {
  vi.useFakeTimers();
  sendRuntimeMessageMock.mockImplementationOnce(
    (message: { generation: number; recordingId: string; streamInstanceId: string }) =>
      new Promise((resolve) => {
        setTimeout(() => {
          allowRecordingBegin({
            generation: message.generation,
            recordingId: message.recordingId,
            streamInstanceId: message.streamInstanceId,
          });
          resolve({ success: true, result: 'ALLOW' });
        }, 10_000);
      })
  );

  const start = startRecording(
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      settings: { ...createSettings(), countdownSeconds: 10 },
      streamId: 'stream-1',
    },
    messaging
  );
  await vi.advanceTimersByTimeAsync(10_000);

  await expect(start).resolves.toBeUndefined();
  expect(finalizeRecordingBootstrapMock).toHaveBeenCalledOnce();
});

it('fails closed when background denies the raw source', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'DENY' });

  await expect(
    startRecording(
      {
        generation: 1,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-instance-1',
        settings: createSettings(),
        streamId: 'stream-1',
      },
      messaging
    )
  ).rejects.toThrow('source-dimensions-mismatch');
  expect(finalizeRecordingBootstrapMock).not.toHaveBeenCalled();
  expect(cleanupResourcesMock).toHaveBeenCalled();
});

it('settles the real begin gate before propagating a SOURCE_READY transport failure', async () => {
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('background unavailable'));

  await expect(
    startRecording(
      {
        generation: 1,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-instance-1',
        settings: createSettings(),
        streamId: 'stream-1',
      },
      messaging
    )
  ).rejects.toThrow('background unavailable');
  expect(cleanupResourcesMock).toHaveBeenCalled();
});

it('cleans up when the session becomes stale during setup', async () => {
  recordingContextMock.currentRecordingId = null;
  recordingContextMock.lifecycleState = 'idle';

  await startRecording(
    {
      generation: 1,
      recordingId: 'recording-stale',
      streamInstanceId: 'stream-instance-stale',
      settings: createSettings(),
      streamId: 'stream-stale',
    },
    messaging
  );

  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('routes setup errors through the shared start-error path', async () => {
  prepareRecordingStreamMock.mockRejectedValueOnce(new Error('stream failed'));

  await expect(
    startRecording(
      {
        generation: 1,
        recordingId: 'recording-error',
        streamInstanceId: 'stream-instance-error',
        settings: createSettings(),
        streamId: 'stream-error',
      },
      messaging
    )
  ).rejects.toThrow('stream failed');
  expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(expect.any(Error), 'recording-error');
});
