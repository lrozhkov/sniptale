import { beforeEach, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  hasActiveMultiSourceRecordingMock,
  hasActiveSidecarSessionMock,
  loggerDebugMock,
  pauseActiveSidecarRecordersMock,
  resumeActiveSidecarRecordersMock,
  sendRuntimeMessageMock,
  startRecordingImplMock,
  stopActiveSidecarRecordersWithFlushMock,
  translateMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  hasActiveSidecarSessionMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  pauseActiveSidecarRecordersMock: vi.fn(),
  resumeActiveSidecarRecordersMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('./start/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./start/index')>();
  return {
    ...actual,
    cleanupResources: cleanupResourcesMock,
    startRecording: startRecordingImplMock,
  };
});

vi.mock('./multi-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./multi-source')>();
  return {
    ...actual,
    hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
  };
});

vi.mock('./sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sidecar')>();
  return {
    ...actual,
    hasActiveSidecarSession: hasActiveSidecarSessionMock,
    pauseActiveSidecarRecorders: pauseActiveSidecarRecordersMock,
    resumeActiveSidecarRecorders: resumeActiveSidecarRecordersMock,
    stopActiveSidecarRecordersWithFlush: stopActiveSidecarRecordersWithFlushMock,
  };
});

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/runtime-messaging/index')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

vi.mock('../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: loggerDebugMock,
    }),
  };
});

import { pauseRecording, resumeRecording, startRecording, stopRecording } from './controller';
import { recordingContext } from './context';

function createDurationTracker() {
  return {
    freeze: vi.fn(),
    getElapsedSeconds: vi.fn(() => 12),
    publishDuration: vi.fn(),
    startSegment: vi.fn(),
    stopSegment: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasActiveMultiSourceRecordingMock.mockReturnValue(false);
  hasActiveSidecarSessionMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
  recordingContext.resetRecordingSession();
  recordingContext.durationTracker = createDurationTracker() as never;
  recordingContext.mediaRecorder = null;
});

it('rejects duplicate starts when only a webcam sidecar session is active', async () => {
  hasActiveSidecarSessionMock.mockReturnValueOnce(true);

  await expect(startRecording({ streamId: 'stream-2' } as never)).rejects.toThrow(
    't:background.runtime.recordingAlreadyRunning'
  );

  expect(startRecordingImplMock).not.toHaveBeenCalled();
});

it('kicks off webcam sidecar flush when stopping the main recorder', async () => {
  recordingContext.beginRecordingSession('recording-1');
  recordingContext.activateRecorder({
    requestData: vi.fn(),
    state: 'recording',
    stop: vi.fn(),
  } as never);

  const stopPromise = stopRecording();
  recordingContext.stopRecordingResolve?.();

  expect(stopActiveSidecarRecordersWithFlushMock).toHaveBeenCalledOnce();
  await expect(stopPromise).resolves.toBeUndefined();
});

it('keeps sidecar stop rejection handled while the main recorder owns stop completion', async () => {
  stopActiveSidecarRecordersWithFlushMock.mockRejectedValueOnce(new Error('sidecar failed'));
  recordingContext.beginRecordingSession('recording-1');
  recordingContext.activateRecorder({
    requestData: vi.fn(),
    state: 'recording',
    stop: vi.fn(),
  } as never);

  const stopPromise = stopRecording();
  await Promise.resolve();
  recordingContext.stopRecordingResolve?.();

  await expect(stopPromise).resolves.toBeUndefined();
});

it('routes pause and resume to active webcam sidecars', () => {
  recordingContext.mediaRecorder = {
    pause: vi.fn(function pause(this: { state: RecordingState }) {
      this.state = 'paused';
    }),
    resume: vi.fn(),
    state: 'recording',
  } as never;

  pauseRecording();
  expect(pauseActiveSidecarRecordersMock).toHaveBeenCalledOnce();

  recordingContext.mediaRecorder = {
    resume: vi.fn(),
    state: 'paused',
  } as never;

  resumeRecording();
  expect(resumeActiveSidecarRecordersMock).toHaveBeenCalledOnce();
});
