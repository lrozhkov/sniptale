import { beforeEach, expect, it, vi } from 'vitest';

import { createSettings, createTrack } from './helpers.test-support';

const {
  cleanupActiveSidecarRecordersMock,
  detachCachedPreviewMock,
  loggerErrorMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
  observationFactoryMock,
} = vi.hoisted(() => ({
  cleanupActiveSidecarRecordersMock: vi.fn(),
  detachCachedPreviewMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  observationFactoryMock: vi.fn(),
}));

vi.mock('../stream/microphone-activity', () => ({
  createMicrophoneActivityObserver: observationFactoryMock,
}));

vi.mock('../sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidecar')>()),
  cleanupActiveSidecarRecorders: cleanupActiveSidecarRecordersMock,
}));

vi.mock('../setup/desktop-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../setup/desktop-media')>()),
  detachCachedPreview: detachCachedPreviewMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { recordingContext } from '../context';
import { cleanupResources } from './cleanup';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import { handleRecordingStartError, initializeRecordingSession } from './session';
import {
  isRecordingStartErrorReported,
  RecordingStartCleanupConfirmedError,
  unwrapRecordingStartReportedError,
} from './error-reporting';
import {
  acquireVideoRecordingMediaActivityLease,
  releaseVideoRecordingMediaActivityLease,
} from '../../media-activity/video-recording-lease';
import {
  acquireOffscreenMediaActivityLease,
  resetOffscreenMediaActivityLeaseForTests,
} from '../../media-activity/lease';

beforeEach(() => {
  vi.clearAllMocks();
  releaseVideoRecordingMediaActivityLease();
  resetOffscreenMediaActivityLeaseForTests();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  observationFactoryMock.mockImplementation(createObservation);

  recordingContext.resetRecordingSession();
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.currentRecordingId = null;
  recordingContext.stopRecordingResolve = null;
  recordingContext.stopRecordingReject = null;
});

function createObservation() {
  return {
    current: { status: 'disabled' as const, level: 0, warning: false },
    dispose: vi.fn(),
    setEnabled: vi.fn(),
    setSource: vi.fn(),
    setPhase: vi.fn(),
  };
}

it('disposes microphone observation before a cancelled preparation is retried', () => {
  const previous = createObservation();
  const replacement = createObservation();
  observationFactoryMock.mockReturnValueOnce(previous).mockReturnValueOnce(replacement);
  const first = {
    settings: { ...createSettings(), microphoneEnabled: true },
    streamId: 'stream-1',
    recordingId: 'recording-1',
    generation: 1,
    streamInstanceId: 'instance-1',
    captureMode: 'TAB_CROP',
    viewport: { width: 1280, height: 720 },
    cropRegion: { x: 0, y: 0, width: 640, height: 480 },
  };
  initializeRecordingSession(first);
  expect(previous.setEnabled).toHaveBeenCalledWith(true);
  cleanupResources();
  initializeRecordingSession({
    ...first,
    settings: { ...first.settings, microphoneEnabled: false },
    recordingId: 'recording-2',
    generation: 2,
    streamInstanceId: 'instance-2',
  });
  expect(previous.dispose).toHaveBeenCalledOnce();
  expect(replacement.setEnabled).toHaveBeenCalledWith(false);
  expect(
    recordingContext.matchesSourceBinding({
      recordingId: 'recording-1',
      generation: 1,
      streamInstanceId: 'instance-1',
    })
  ).toBe(false);
  expect(
    recordingContext.matchesSourceBinding({
      recordingId: 'recording-2',
      generation: 2,
      streamInstanceId: 'instance-2',
    })
  ).toBe(true);
  cleanupResources();
  expect(replacement.dispose).toHaveBeenCalledOnce();
  expect(previous.dispose).toHaveBeenCalledOnce();
  expect(recordingContext.currentRecordingId).toBeNull();
});

it('confirms startup cleanup only after retiring the owned source binding', () => {
  const binding = {
    recordingId: 'recording-owned',
    generation: 2,
    streamInstanceId: 'source-owned',
  };
  recordingContext.beginRecordingSession(binding.recordingId, binding.generation);
  recordingContext.bindStreamInstance(binding);
  const reported = handleRecordingStartError(
    new Error('source failed'),
    binding.recordingId,
    binding
  );
  expect(reported).toBeInstanceOf(RecordingStartCleanupConfirmedError);
  expect(recordingContext.currentRecordingId).toBeNull();
  expect(isRecordingStartErrorReported(reported)).toBe(true);
});

it('does not confirm asynchronous artifact retirement as completed source cleanup', () => {
  const binding = {
    recordingId: 'recording-owned',
    generation: 2,
    streamInstanceId: 'source-owned',
  };
  recordingContext.beginRecordingSession(binding.recordingId, binding.generation);
  recordingContext.bindStreamInstance(binding);
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  const reported = handleRecordingStartError(
    new Error('encoding failed'),
    binding.recordingId,
    binding
  );
  expect(reported).not.toBeInstanceOf(RecordingStartCleanupConfirmedError);
});

it('does not confirm startup cleanup when resource retirement throws', () => {
  const binding = {
    recordingId: 'recording-owned',
    generation: 2,
    streamInstanceId: 'source-owned',
  };
  recordingContext.beginRecordingSession(binding.recordingId, binding.generation);
  recordingContext.bindStreamInstance(binding);
  detachCachedPreviewMock.mockImplementationOnce(() => {
    throw new Error('cleanup refused');
  });
  expect(() =>
    handleRecordingStartError(new Error('source failed'), binding.recordingId, binding)
  ).toThrow('cleanup refused');
  expect(recordingContext.currentRecordingId).toBe(binding.recordingId);
});

it.each([new Error('early preparation failed'), 'early preparation refused'])(
  'reports unscoped startup failure without inventing a recording identity: %s',
  (error) => {
    const reported = handleRecordingStartError(error);
    const message = error instanceof Error ? error.message : String(error);
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { originalErrorMessage: message },
        payload: { type: VideoMessageType.OFFSCREEN_ERROR, error: message, phase: 'start' },
      })
    );
    expect(isRecordingStartErrorReported(reported)).toBe(true);
    expect(unwrapRecordingStartReportedError(reported)).toBe(error);
    expect(recordingContext.currentRecordingId).toBeNull();
  }
);

it('preserves an explicit preparation identity when reporting a primitive startup failure', () => {
  const reported = handleRecordingStartError('source unavailable', 'recording-attempt');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      context: { originalErrorMessage: 'source unavailable' },
      payload: {
        type: VideoMessageType.OFFSCREEN_ERROR,
        error: 'source unavailable',
        phase: 'start',
        recordingId: 'recording-attempt',
      },
    })
  );
  expect(isRecordingStartErrorReported(reported)).toBe(true);
  expect(unwrapRecordingStartReportedError(reported)).toBe('source unavailable');
  expect(detachCachedPreviewMock).toHaveBeenCalledOnce();
});

it('releases the shared video lease from unexpected terminal cleanup', () => {
  expect(acquireVideoRecordingMediaActivityLease().acquired).toBe(true);

  cleanupResources();

  const speech = acquireOffscreenMediaActivityLease('speech-recognition');
  expect(speech.acquired).toBe(true);
  if (speech.acquired) speech.lease.release();
});

it('releases the shared video lease even when terminal cleanup throws', () => {
  expect(acquireVideoRecordingMediaActivityLease().acquired).toBe(true);
  detachCachedPreviewMock.mockImplementationOnce(() => {
    throw new Error('preview cleanup failed');
  });

  expect(() => cleanupResources()).toThrow('preview cleanup failed');

  const speech = acquireOffscreenMediaActivityLease('speech-recognition');
  expect(speech.acquired).toBe(true);
  if (speech.acquired) speech.lease.release();
});

it('binds the background-minted recording and stream identities before source setup', () => {
  expect(
    initializeRecordingSession({
      settings: createSettings(),
      streamId: 'stream-1',
      recordingId: 'recording-1',
      generation: 1,
      streamInstanceId: 'stream-instance-1',
    })
  ).toBe('recording-1');
  expect(recordingContext.currentRecordingId).toBe('recording-1');
  expect(
    recordingContext.matchesSourceBinding({
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    })
  ).toBe(true);
});

it('delegates recorder shutdown to the artifact owner while cleaning up other resources', async () => {
  const cleanupError = new Error('cleanup failed');
  const sourceTrackStop = vi.fn();
  const videoTrackStop = vi.fn();
  const recorderStop = vi.fn();
  const artifactAbort = vi.fn().mockResolvedValue(undefined);

  recordingContext.audioMixer = {
    cleanup: vi.fn().mockRejectedValue(cleanupError),
  } as never;
  recordingContext.sourceStream = {
    getTracks: () => [createTrack(sourceTrackStop)],
  } as never;
  recordingContext.videoStream = {
    getTracks: () => [createTrack(videoTrackStop)],
  } as never;
  recordingContext.artifactSession = {
    abort: artifactAbort,
    pause: vi.fn(),
    resume: vi.fn(),
    setLifecycleCallbacks: vi.fn(),
    start: vi.fn(),
    state: 'recording',
    stop: vi.fn(),
  };

  cleanupResources();
  await Promise.resolve();

  expect(detachCachedPreviewMock).toHaveBeenCalledOnce();
  expect(cleanupActiveSidecarRecordersMock).toHaveBeenCalledOnce();
  expect(sourceTrackStop).toHaveBeenCalledOnce();
  expect(videoTrackStop).toHaveBeenCalledOnce();
  expect(artifactAbort).toHaveBeenCalledOnce();
  expect(recorderStop).not.toHaveBeenCalled();
  expect(loggerWarnMock).toHaveBeenCalledWith('Audio mixer cleanup failed', cleanupError);
  expect(recordingContext.sourceStream).toBeNull();
  expect(recordingContext.videoStream).toBeNull();
});

it('reports start errors against the active session before cleanup', () => {
  recordingContext.beginRecordingSession('recording-2');
  recordingContext.videoStream = {
    getTracks: () => [createTrack()],
  } as never;

  handleRecordingStartError(new Error('boom'));

  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to start recording', expect.any(Error));
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      logMessage: 'Failed to notify runtime about recording start failure',
      payload: {
        type: VideoMessageType.OFFSCREEN_ERROR,
        error: 'boom',
        phase: 'start',
        recordingId: 'recording-2',
      },
    })
  );
  expect(recordingContext.videoStream).toBeNull();
});
