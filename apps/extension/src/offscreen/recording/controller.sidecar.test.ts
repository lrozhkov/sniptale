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
    startRecording: startRecordingImplMock,
  };
});
vi.mock('./start/cleanup', () => ({
  cleanupResources: cleanupResourcesMock,
}));

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
import { createRecordingStagingCoordinatorTestDouble } from './encoding/artifact-session.test-support';

function createDurationTracker() {
  return {
    freeze: vi.fn(),
    getElapsedSeconds: vi.fn(() => 12),
    publishDuration: vi.fn(),
    startSegment: vi.fn(),
    stopSegment: vi.fn(),
  };
}

function bindActiveArtifactSession(binding: {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}) {
  const mediaRecorder = Object.assign(new EventTarget(), {
    pause: vi.fn(),
    requestData: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
    state: 'recording' as RecordingState,
    stop: vi.fn(),
  }) as unknown as MediaRecorder;
  const file = new File(['saved'], 'recording.webm', { type: 'video/webm' });
  const artifactStop = vi.fn(async () => {
    mediaRecorder.dispatchEvent(new Event('stop'));
    recordingContext.stopRecordingResolve?.({ result: 'stopped' });
    return {
      artifactId: binding.recordingId,
      file,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    };
  });
  recordingContext.stagingCoordinator = createRecordingStagingCoordinatorTestDouble();
  recordingContext.bindStartingArtifactSession({
    abort: vi.fn().mockResolvedValue(undefined),
    recorder: mediaRecorder,
    setLifecycleCallbacks: vi.fn(),
    start: vi.fn(),
    stop: artifactStop,
  });
  recordingContext.activateRecorder(mediaRecorder);
  return artifactStop;
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

it('delegates main and sidecar finalization to the artifact lifecycle owner', async () => {
  recordingContext.beginRecordingSession('recording-1');
  const binding = {
    generation: 0,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  };
  recordingContext.bindStreamInstance(binding);
  const artifactStop = bindActiveArtifactSession(binding);

  await expect(stopRecording(binding)).resolves.toEqual({ result: 'stopped' });

  expect(artifactStop).toHaveBeenCalledOnce();
  expect(stopActiveSidecarRecordersWithFlushMock).not.toHaveBeenCalled();
});

it('does not start a competing sidecar stop when the artifact lifecycle owns completion', async () => {
  stopActiveSidecarRecordersWithFlushMock.mockRejectedValueOnce(new Error('sidecar failed'));
  recordingContext.beginRecordingSession('recording-1');
  const binding = {
    generation: 0,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  };
  recordingContext.bindStreamInstance(binding);
  const artifactStop = bindActiveArtifactSession(binding);

  await expect(stopRecording(binding)).resolves.toEqual({ result: 'stopped' });

  expect(artifactStop).toHaveBeenCalledOnce();
  expect(stopActiveSidecarRecordersWithFlushMock).not.toHaveBeenCalled();
});

it('routes pause and resume to active webcam sidecars', () => {
  const binding = {
    generation: 0,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  };
  recordingContext.beginRecordingSession(binding.recordingId);
  recordingContext.bindStreamInstance(binding);
  recordingContext.mediaRecorder = {
    pause: vi.fn(function pause(this: { state: RecordingState }) {
      this.state = 'paused';
    }),
    resume: vi.fn(),
    state: 'recording',
  } as never;

  pauseRecording(binding);
  expect(pauseActiveSidecarRecordersMock).toHaveBeenCalledOnce();

  recordingContext.mediaRecorder = {
    resume: vi.fn(),
    state: 'paused',
  } as never;

  resumeRecording(binding);
  expect(resumeActiveSidecarRecordersMock).toHaveBeenCalledOnce();
});
