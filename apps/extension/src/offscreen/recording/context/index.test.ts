import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerDebugMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

import { recordingContext } from '.';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function resetRecordingContextForTest() {
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.durationTracker.reset();
}

function expectEmptyRecordingState() {
  expect(recordingContext.mediaRecorder).toBeNull();
  expect(recordingContext.videoStream).toBeNull();
  expect(recordingContext.sourceStream).toBeNull();
  expect(recordingContext.audioMixer).toBeNull();
  expect(recordingContext.artifactSession).toBeNull();
  expect(recordingContext.stagingCoordinator).toBeNull();
  expect(recordingContext.currentRecordingId).toBeNull();
  expect(recordingContext.lifecycleState).toBe('idle');
}

function bindStartingArtifactSession(mediaRecorder: MediaRecorder): void {
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  recordingContext.bindStartingArtifactSession({
    abort: vi.fn().mockResolvedValue(undefined),
    recorder: mediaRecorder,
    setLifecycleCallbacks: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
}

function verifyLifecycleOwnerApi() {
  const mediaRecorder = { state: 'inactive' } as MediaRecorder;

  recordingContext.beginRecordingSession('recording-1');
  expect(recordingContext.lifecycleState).toBe('starting');
  expect(recordingContext.currentRecordingId).toBe('recording-1');

  bindStartingArtifactSession(mediaRecorder);
  expect(recordingContext.lifecycleState).toBe('starting');
  expect(recordingContext.mediaRecorder).toBe(mediaRecorder);

  recordingContext.activateRecorder(mediaRecorder);
  expect(recordingContext.lifecycleState).toBe('recording');
  expect(recordingContext.mediaRecorder).toBe(mediaRecorder);

  recordingContext.beginStopRequest({
    reject: vi.fn(),
    resolve: vi.fn(),
  });
  expect(recordingContext.lifecycleState).toBe('stopping');

  recordingContext.resetRecordingSession();
  expect(recordingContext.lifecycleState).toBe('idle');
  expect(recordingContext.currentRecordingId).toBeNull();
}

function verifyIllegalLifecycleTransition() {
  expect(() =>
    recordingContext.beginStopRequest({
      reject: vi.fn(),
      resolve: vi.fn(),
    })
  ).toThrow('Illegal recording lifecycle transition: idle -> stopping');
}

describe('offscreen-recording-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecordingContextForTest();
    sendRuntimeMessageMock.mockResolvedValue(undefined);
  });

  it('starts with empty mutable recording state', () => {
    expectEmptyRecordingState();
  });

  it('tracks legal recording lifecycle transitions through the owner API', verifyLifecycleOwnerApi);

  it('binds the artifact owner and its recorder atomically after staging is ready', () => {
    const mediaRecorder = { state: 'inactive' } as MediaRecorder;
    const artifactSession = {
      abort: vi.fn().mockResolvedValue(undefined),
      recorder: mediaRecorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    recordingContext.beginRecordingSession('recording-1');

    expect(() => recordingContext.bindStartingArtifactSession(artifactSession)).toThrow(
      'Recording session cannot bind stale artifacts'
    );
    expect(recordingContext.artifactSession).toBeNull();
    expect(recordingContext.mediaRecorder).toBeNull();

    recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
    recordingContext.bindStartingArtifactSession(artifactSession);

    expect(recordingContext.artifactSession).toBe(artifactSession);
    expect(recordingContext.mediaRecorder).toBe(mediaRecorder);
  });

  it('binds a stream instance only to the matching starting session', () => {
    recordingContext.beginRecordingSession('recording-1', 3);

    expect(() =>
      recordingContext.bindStreamInstance({
        generation: 3,
        recordingId: 'stale-recording',
        streamInstanceId: 'stream-1',
      })
    ).toThrow('Stale recording source binding');
    expect(() =>
      recordingContext.bindStreamInstance({
        generation: 2,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-1',
      })
    ).toThrow('Stale recording source binding');

    recordingContext.bindStreamInstance({
      generation: 3,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
    });
    expect(
      recordingContext.matchesSourceBinding({
        generation: 3,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-1',
      })
    ).toBe(true);
    expect(
      recordingContext.matchesSourceBinding({
        generation: 3,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-2',
      })
    ).toBe(false);

    const mediaRecorder = { state: 'recording' } as MediaRecorder;
    bindStartingArtifactSession(mediaRecorder);
    recordingContext.activateRecorder(mediaRecorder);
    expect(() =>
      recordingContext.bindStreamInstance({
        generation: 3,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-2',
      })
    ).toThrow('Stale recording source binding');
  });

  it('delivers one current source invalidation and ignores stale generations', () => {
    const binding = { generation: 3, recordingId: 'recording-1', streamInstanceId: 'stream-1' };
    recordingContext.beginRecordingSession(binding.recordingId, binding.generation);
    recordingContext.bindStreamInstance(binding);
    const pending = new Error('verified source changed');

    expect(recordingContext.reportSourceInvalidation({ ...binding, generation: 2 }, pending)).toBe(
      'stale'
    );
    expect(recordingContext.reportSourceInvalidation(binding, pending)).toBe('applied');

    const handler = vi.fn();
    expect(recordingContext.registerSourceFailureHandler(binding, handler)).toBe(pending);
    expect(handler).not.toHaveBeenCalled();
    expect(
      recordingContext.reportSourceInvalidation(binding, new Error('duplicate invalidation'))
    ).toBe('applied');
    expect(handler).not.toHaveBeenCalled();
  });

  it('routes a post-registration source invalidation to the current terminal handler once', () => {
    const binding = { generation: 4, recordingId: 'recording-2', streamInstanceId: 'stream-2' };
    recordingContext.beginRecordingSession(binding.recordingId, binding.generation);
    recordingContext.bindStreamInstance(binding);
    const handler = vi.fn();
    expect(recordingContext.registerSourceFailureHandler(binding, handler)).toBeNull();

    const error = new Error('source resized');
    expect(recordingContext.reportSourceInvalidation(binding, error)).toBe('applied');
    expect(recordingContext.reportSourceInvalidation(binding, error)).toBe('applied');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(error);
  });

  it(
    'rejects illegal lifecycle transitions before a recording session is initialized',
    verifyIllegalLifecycleTransition
  );

  it('tracks discard-aware stop requests and clears their handlers explicitly', () => {
    const resolve = vi.fn();
    const reject = vi.fn();

    recordingContext.beginRecordingSession('recording-1');
    const mediaRecorder = { state: 'recording' } as MediaRecorder;
    bindStartingArtifactSession(mediaRecorder);
    recordingContext.activateRecorder(mediaRecorder);
    recordingContext.beginStopRequest({ discard: true, resolve, reject });

    expect(recordingContext.discardOnStop).toBe(true);
    expect(recordingContext.clearStopRequest()).toEqual({ resolve, reject });
    expect(recordingContext.stopRecordingResolve).toBeNull();
    expect(recordingContext.stopRecordingReject).toBeNull();
  });

  it('cancels a bound starting recorder before native activation', () => {
    const mediaRecorder = { state: 'inactive' } as MediaRecorder;
    const cancel = vi.fn();
    recordingContext.beginRecordingSession('recording-1');
    bindStartingArtifactSession(mediaRecorder);
    recordingContext.registerStartingRecorderCancellation(mediaRecorder, cancel);

    expect(recordingContext.cancelStartingRecorder()).toBe(true);

    expect(cancel).toHaveBeenCalledOnce();
    expect(recordingContext.lifecycleState).toBe('stopping');
    expect(() => recordingContext.activateRecorder(mediaRecorder)).toThrow(
      'Illegal recording lifecycle transition: stopping -> recording'
    );
  });

  it('treats lifecycle and active media resources as recording-session ownership signals', () => {
    expect(recordingContext.hasActiveRecordingSession()).toBe(false);

    recordingContext.sourceStream = {} as MediaStream;
    expect(recordingContext.hasActiveRecordingSession()).toBe(true);

    recordingContext.sourceStream = null;
    recordingContext.beginRecordingSession('recording-2');
    expect(recordingContext.hasActiveRecordingSession()).toBe(true);

    recordingContext.resetRecordingSession();
    expect(recordingContext.hasActiveRecordingSession()).toBe(false);
  });

  it('publishes duration updates through the shared runtime transport', async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));
    recordingContext.beginRecordingSession('rec-1');

    recordingContext.durationTracker.publishDuration();
    await flushPromises();

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: VideoMessageType.RECORDING_DURATION_UPDATED,
      duration: 0,
      recordingId: 'rec-1',
    });
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Failed to publish recording duration update',
      expect.objectContaining({
        duration: 0,
        errorMessage: 'popup closed',
        recordingId: 'rec-1',
      })
    );
  });
});
