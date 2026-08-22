import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { TestMediaStream } from './multi-source/media-stream.test-support';
import type { FinalizedRecordingStagingArtifact } from '../../composition/persistence/recordings/staging';
import { createPreparedRecordingAssetForTest } from '../../composition/persistence/recordings/staging/test-support';

const {
  cancelPendingMultiSourceRecordingStartMock,
  cleanupResourcesMock,
  retryPendingPostRecordResultMock,
  sendRuntimeMessageBestEffortMock,
  startRecordingImplMock,
  stopActiveSidecarRecordersWithFlushMock,
} = vi.hoisted(() => ({
  cancelPendingMultiSourceRecordingStartMock: vi.fn(),
  cleanupResourcesMock: vi.fn(),
  retryPendingPostRecordResultMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
}));

vi.mock('./start/index', () => ({
  startRecording: startRecordingImplMock,
}));
vi.mock('./start/cleanup', () => ({
  cleanupResources: cleanupResourcesMock,
}));
vi.mock('./post-record-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./post-record-publication')>()),
  retryPendingPostRecordResult: retryPendingPostRecordResultMock,
}));
vi.mock('../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));
vi.mock('./multi-source', () => ({
  cancelPendingMultiSourceRecordingStart: cancelPendingMultiSourceRecordingStartMock,
  getActiveMultiSourceRecordingId: vi.fn(() => null),
  hasActiveMultiSourceRecording: vi.fn(() => false),
  pauseMultiSourceRecording: vi.fn(),
  resumeMultiSourceRecording: vi.fn(),
  startMultiSourceRecording: vi.fn(),
  stopMultiSourceRecording: vi.fn(),
  updateMultiSourceRecordingSettings: vi.fn(),
}));
vi.mock('./sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sidecar')>()),
  hasActiveSidecarSession: vi.fn(() => false),
  stopActiveSidecarRecordersWithFlush: stopActiveSidecarRecordersWithFlushMock,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
}));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

import {
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  updateRecordingSettings,
} from './controller';
import { recordingContext } from './context';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PostRecordPublicationError } from './post-record-publication';
import { createRecordingStagingCoordinatorTestDouble } from './encoding/artifact-session.test-support';

class ActiveMediaRecorderFixture extends EventTarget implements MediaRecorder {
  readonly audioBitsPerSecond = 0;
  readonly mimeType = 'video/webm';
  ondataavailable: MediaRecorder['ondataavailable'] = null;
  onerror: MediaRecorder['onerror'] = null;
  onpause: MediaRecorder['onpause'] = null;
  onresume: MediaRecorder['onresume'] = null;
  onstart: MediaRecorder['onstart'] = null;
  onstop: MediaRecorder['onstop'] = null;
  readonly requestData = vi.fn();
  readonly state: RecordingState = 'recording';
  readonly stop = vi.fn();
  readonly stream = new TestMediaStream([]);
  readonly videoBitsPerSecond = 0;

  pause(): void {}
  resume(): void {}
  start(): void {}

  emitStop(): void {
    const event = new Event('stop');
    this.onstop?.(event);
    this.dispatchEvent(event);
  }
}

function createStartParams(): Parameters<typeof startRecording>[0] {
  return {
    generation: 1,
    recordingId: 'recording-delayed',
    streamInstanceId: 'stream-instance-delayed',
    streamId: 'stream-delayed',
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      autoFadeDelay: 0,
      countdownSeconds: 0,
      interactionDiagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
      outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
      systemAudioEnabled: false,
    },
  };
}

const sourceBinding = {
  generation: 1,
  recordingId: 'recording-delayed',
  streamInstanceId: 'stream-instance-delayed',
};

function createActiveRecorderFixture() {
  const recorder = new ActiveMediaRecorderFixture();
  return { recorder, stop: recorder.stop };
}

const boundArtifactSessions = new WeakMap<
  ActiveMediaRecorderFixture,
  NonNullable<typeof recordingContext.artifactSession>
>();

function requireBoundArtifactSession(recorder: ActiveMediaRecorderFixture) {
  const session = boundArtifactSessions.get(recorder);
  if (!session) throw new Error('Test recorder has no bound artifact session');
  return session;
}

function bindArtifactSession(
  recorder: ActiveMediaRecorderFixture,
  stopImplementation: () => Promise<FinalizedRecordingStagingArtifact> = async () => {
    recorder.stop();
    const file = new File(['saved'], 'recording.webm', { type: 'video/webm' });
    return {
      artifactId: 'recording-delayed',
      asset: createPreparedRecordingAssetForTest(file, 'recording-delayed'),
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    };
  }
) {
  const stop = vi.fn(stopImplementation);
  recordingContext.stagingCoordinator ??= createRecordingStagingCoordinatorTestDouble();
  const artifactSession = {
    abort: vi.fn().mockResolvedValue(undefined),
    pause: () => recorder.pause(),
    resume: () => recorder.resume(),
    setLifecycleCallbacks: vi.fn(),
    start: vi.fn(),
    get state() {
      return recorder.state;
    },
    stop,
  };
  recordingContext.bindStartingArtifactSession(artifactSession);
  boundArtifactSessions.set(recorder, artifactSession);
  return stop;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  recordingContext.resetRecordingSession();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
  retryPendingPostRecordResultMock.mockResolvedValue(false);
});

it('waits for a delayed start and terminates activation before acknowledging stop', async () => {
  let completeStart!: () => void;
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = () => {
          recordingContext.beginRecordingSession('recording-delayed', 1);
          recordingContext.bindStreamInstance(sourceBinding);
          bindArtifactSession(recorder);
          recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
          resolve();
        };
      })
  );

  const start = startRecording(createStartParams());
  const stop = stopRecording(sourceBinding, true);
  let stopSettled = false;
  void stop.then(() => {
    stopSettled = true;
  });
  await flushPromises();
  expect(stopSettled).toBe(false);

  completeStart();
  await start;
  await vi.waitFor(() => expect(stopRecorder).toHaveBeenCalledOnce());
  recordingContext.stopRecordingResolve?.();
  await expect(stop).resolves.toEqual({ result: 'stopped' });
});

it('cancels a bound recorder that has not emitted its native start event', async () => {
  const cancelStartingRecorder = vi.fn();
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.registerStartingRecorderCancellation(
      requireBoundArtifactSession(recorder),
      cancelStartingRecorder
    );
  });

  await startRecording(createStartParams());
  await expect(stopRecording(sourceBinding, true)).resolves.toEqual({ result: 'stopped' });

  expect(cancelStartingRecorder).toHaveBeenCalledOnce();
  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(stopRecorder).not.toHaveBeenCalled();
});

it('delegates normal STOP to the artifact session as the only raw recorder stop owner', async () => {
  const { recorder, stop: rawRecorderStop } = createActiveRecorderFixture();
  const artifact = {
    artifactId: 'recording-delayed',
    asset: createPreparedRecordingAssetForTest(
      new File(['saved'], 'recording.webm', { type: 'video/webm' }),
      'recording-delayed'
    ),
    filename: 'recording.webm',
    mimeType: 'video/webm',
    size: 5,
  };
  const artifactStop = vi.fn(async () => {
    recordingContext.stopRecordingResolve?.({ result: 'stopped' });
    return artifact;
  });
  rawRecorderStop.mockImplementation(() => {
    recordingContext.stopRecordingResolve?.({ result: 'stopped' });
  });
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder, artifactStop);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });

  await startRecording(createStartParams());
  await expect(stopRecording(sourceBinding)).resolves.toEqual({ result: 'stopped' });

  expect(artifactStop).toHaveBeenCalledOnce();
  expect(rawRecorderStop).not.toHaveBeenCalled();
});

it('joins source-ended finalization and keeps the next recording STOP operable', async () => {
  const { recorder: firstRecorder } = createActiveRecorderFixture();
  const firstFile = new File(['first'], 'first.webm', { type: 'video/webm' });
  const firstArtifact = {
    artifactId: sourceBinding.recordingId,
    asset: createPreparedRecordingAssetForTest(firstFile, sourceBinding.recordingId),
    filename: firstFile.name,
    mimeType: firstFile.type,
    size: firstFile.size,
  };
  let resolveFirstTerminal!: (artifact: typeof firstArtifact) => void;
  const firstTerminal = new Promise<typeof firstArtifact>((resolve) => {
    resolveFirstTerminal = resolve;
  });
  let firstArtifactStop!: ReturnType<typeof bindArtifactSession>;
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession(sourceBinding.recordingId, sourceBinding.generation);
    recordingContext.bindStreamInstance(sourceBinding);
    firstArtifactStop = bindArtifactSession(firstRecorder, () => firstTerminal);
    recordingContext.activateRecorder(requireBoundArtifactSession(firstRecorder));
  });

  await startRecording(createStartParams());
  recordingContext.beginStopRequest({ discard: false, reject: vi.fn(), resolve: vi.fn() });
  const sourceEndedStop = recordingContext.artifactSession?.stop();
  const backgroundStop = stopRecording(sourceBinding);
  await flushPromises();

  expect(firstArtifactStop).toHaveBeenCalledTimes(2);
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  recordingContext.resetRecordingSession();
  resolveFirstTerminal(firstArtifact);
  await expect(sourceEndedStop).resolves.toEqual(firstArtifact);
  await expect(backgroundStop).resolves.toEqual({ result: 'stopped' });

  const nextBinding = {
    generation: 2,
    recordingId: 'recording-next',
    streamInstanceId: 'stream-instance-next',
  };
  const nextParams = { ...createStartParams(), ...nextBinding };
  const { recorder: nextRecorder } = createActiveRecorderFixture();
  const nextFile = new File(['next'], 'next.webm', { type: 'video/webm' });
  const nextArtifactStop = vi.fn(async () => {
    nextRecorder.dispatchEvent(new Event('stop'));
    recordingContext.stopRecordingResolve?.({ result: 'stopped' });
    return {
      artifactId: nextBinding.recordingId,
      asset: createPreparedRecordingAssetForTest(nextFile, nextBinding.recordingId),
      filename: nextFile.name,
      mimeType: nextFile.type,
      size: nextFile.size,
    };
  });
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession(nextBinding.recordingId, nextBinding.generation);
    recordingContext.bindStreamInstance(nextBinding);
    bindArtifactSession(nextRecorder, nextArtifactStop);
    recordingContext.activateRecorder(requireBoundArtifactSession(nextRecorder));
  });

  await expect(startRecording(nextParams)).resolves.toBeUndefined();
  await expect(stopRecording(nextBinding)).resolves.toEqual({ result: 'stopped' });
  expect(nextArtifactStop).toHaveBeenCalledOnce();
});

it('reports a source-ended finalization failure to the joining background STOP', async () => {
  const finalizationError = new Error('durable publication failed');
  const { recorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession(sourceBinding.recordingId, sourceBinding.generation);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder, async () => {
      throw finalizationError;
    });
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });

  await startRecording(createStartParams());
  recordingContext.beginStopRequest({ discard: false, reject: vi.fn(), resolve: vi.fn() });

  await expect(stopRecording(sourceBinding)).resolves.toEqual({
    error: finalizationError.message,
    result: 'terminal-failure',
  });
});

it('keeps stop pending after recorder terminal progress until durable publication resolves once', async () => {
  vi.useFakeTimers();
  let releaseDurablePublication!: () => void;
  const durablePublication = new Promise<void>((resolve) => {
    releaseDurablePublication = resolve;
  });
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  const finalizeAndPublish = vi.fn(async () => {
    await durablePublication;
    recordingContext.stopRecordingResolve?.();
  });
  recorder.onstop = () => {
    recordingContext.reportArtifactFinalizing();
    void finalizeAndPublish();
  };
  stopRecorder.mockImplementationOnce(() => recorder.emitStop());
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });

  await startRecording(createStartParams());
  const stop = stopRecording(sourceBinding);
  const duplicateStop = stopRecording(sourceBinding);
  let stopSettlementCount = 0;
  void stop.finally(() => {
    stopSettlementCount += 1;
  });
  await flushPromises();

  expect(stopRecorder).toHaveBeenCalledOnce();
  expect(duplicateStop).toBe(stop);
  expect(finalizeAndPublish).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_001);
  expect(stopSettlementCount).toBe(0);
  expect(cleanupResourcesMock).not.toHaveBeenCalled();

  releaseDurablePublication();
  await expect(stop).resolves.toEqual({ result: 'stopped' });
  await expect(duplicateStop).resolves.toEqual({ result: 'stopped' });
  expect(stopSettlementCount).toBe(1);
  expect(finalizeAndPublish).toHaveBeenCalledOnce();
});

it('fails once without recorder terminal progress and prevents late media publication', async () => {
  vi.useFakeTimers();
  const publishCommittedMedia = vi.fn();
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  recorder.onstop = publishCommittedMedia;
  cleanupResourcesMock.mockImplementationOnce(() => {
    recorder.onstop = null;
  });
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });

  await startRecording(createStartParams());
  const stop = stopRecording(sourceBinding);
  let stopSettlementCount = 0;
  void stop.finally(() => {
    stopSettlementCount += 1;
  });
  await flushPromises();
  expect(stopRecorder).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(10_000);
  await expect(stop).resolves.toEqual({
    error: 'background.runtime.recordingStopTimeout',
    result: 'terminal-failure',
  });
  expect(stopSettlementCount).toBe(1);
  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(publishCommittedMedia).not.toHaveBeenCalled();

  recorder.emitStop();
  await flushPromises();
  expect(stopSettlementCount).toBe(1);
  expect(publishCommittedMedia).not.toHaveBeenCalled();

  retryPendingPostRecordResultMock.mockResolvedValueOnce(true);
  await expect(stopRecording(sourceBinding)).resolves.toEqual({ result: 'stopped' });
});

it('retries an already-saved result without restarting finalization or losing the binding', async () => {
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });
  retryPendingPostRecordResultMock.mockResolvedValueOnce(true);

  await startRecording(createStartParams());
  await expect(stopRecording(sourceBinding)).resolves.toEqual({ result: 'stopped' });

  expect(retryPendingPostRecordResultMock).toHaveBeenCalledWith(
    'recording-delayed',
    expect.objectContaining({ sendRuntimeMessage: expect.any(Function) })
  );
  expect(stopRecorder).not.toHaveBeenCalled();
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        recordingId: 'recording-delayed',
        type: 'OFFSCREEN_RECORDING_STOPPED',
      }),
    })
  );
});

it('reconciles a committed result with a lost response before accepting the next start', async () => {
  const { recorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });
  await startRecording(createStartParams());

  retryPendingPostRecordResultMock.mockRejectedValueOnce(
    new PostRecordPublicationError(
      {
        primaryRecordingId: 'recording-delayed',
        projectId: null,
        recordingId: 'recording-delayed',
      },
      new Error('response channel closed')
    )
  );
  await expect(stopRecording(sourceBinding)).rejects.toBeInstanceOf(PostRecordPublicationError);
  recordingContext.resetRecordingSession();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;

  retryPendingPostRecordResultMock.mockResolvedValueOnce(true);
  startRecordingImplMock.mockResolvedValueOnce(undefined);
  const nextParams = {
    ...createStartParams(),
    recordingId: 'recording-next',
    streamInstanceId: 'stream-instance-next',
  };
  await expect(startRecording(nextParams)).resolves.toBeUndefined();

  expect(retryPendingPostRecordResultMock).toHaveBeenLastCalledWith(
    'recording-delayed',
    expect.objectContaining({ sendRuntimeMessage: expect.any(Function) })
  );
  expect(startRecordingImplMock).toHaveBeenLastCalledWith(
    nextParams,
    expect.objectContaining({ sendRuntimeMessage: expect.any(Function) })
  );
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({
        reason: 'post-record-publication-reconciled-before-start',
        recordingId: 'recording-delayed',
      }),
    })
  );
});

it('does not resurrect a retired previous binding when the next start fails', async () => {
  const { recorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    bindArtifactSession(recorder);
    recordingContext.activateRecorder(requireBoundArtifactSession(recorder));
  });
  await startRecording(createStartParams());
  retryPendingPostRecordResultMock.mockRejectedValueOnce(
    new PostRecordPublicationError(
      {
        primaryRecordingId: 'recording-delayed',
        projectId: null,
        recordingId: 'recording-delayed',
      },
      new Error('response channel closed')
    )
  );
  await expect(stopRecording(sourceBinding)).rejects.toBeInstanceOf(PostRecordPublicationError);
  recordingContext.resetRecordingSession();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;

  retryPendingPostRecordResultMock.mockResolvedValueOnce(true);
  startRecordingImplMock.mockRejectedValueOnce(new Error('next source failed'));
  const nextBinding = {
    generation: 1,
    recordingId: 'recording-next',
    streamInstanceId: 'stream-instance-next',
  };
  await expect(startRecording({ ...createStartParams(), ...nextBinding })).rejects.toThrow(
    'next source failed'
  );

  await expect(stopRecording(nextBinding, true)).resolves.toEqual({ result: 'stopped' });
  expect(() => pauseRecording(sourceBinding)).toThrow('Recording source binding is unavailable');
});

it('fails a stuck start cancellation within a deadline and allows a safe retry', async () => {
  vi.useFakeTimers();
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );

  const start = startRecording(createStartParams());
  const stopExpectation = expect(stopRecording(sourceBinding, true)).resolves.toEqual({
    error: 'background.runtime.recordingStopTimeout',
    result: 'terminal-failure',
  });
  await vi.advanceTimersByTimeAsync(10_000);
  await stopExpectation;
  expect(cancelPendingMultiSourceRecordingStartMock).toHaveBeenCalledOnce();

  completeStart();
  await start;
  await expect(stopRecording(sourceBinding, true)).resolves.toEqual({ result: 'stopped' });
});

it('rejects a delayed stop whose source identity belongs to another start', async () => {
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );
  const start = startRecording(createStartParams());

  await expect(
    stopRecording(
      {
        generation: 1,
        recordingId: 'recording-stale',
        streamInstanceId: 'stream-instance-stale',
      },
      true
    )
  ).rejects.toThrow('Stale recording source binding');
  expect(cancelPendingMultiSourceRecordingStartMock).not.toHaveBeenCalled();

  completeStart();
  await start;
});

it('rejects delayed pause, resume, and settings commands from another recording start', async () => {
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );
  const start = startRecording(createStartParams());
  const stale = {
    generation: 0,
    recordingId: 'recording-stale',
    streamInstanceId: 'stream-instance-stale',
  };

  expect(() => pauseRecording(stale)).toThrow('Stale recording source binding');
  expect(() => resumeRecording(stale)).toThrow('Stale recording source binding');
  expect(() => updateRecordingSettings(stale, { microphoneEnabled: false })).toThrow(
    'Stale recording source binding'
  );

  completeStart();
  await start;
});
