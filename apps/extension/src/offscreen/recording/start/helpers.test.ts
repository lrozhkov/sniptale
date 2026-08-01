import { beforeEach, expect, it, vi } from 'vitest';

import { createSettings, createTrack } from './helpers.test-support';

const {
  cleanupActiveSidecarRecordersMock,
  detachCachedPreviewMock,
  loggerErrorMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  cleanupActiveSidecarRecordersMock: vi.fn(),
  detachCachedPreviewMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
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
import { handleRecordingStartError, initializeRecordingSession } from './session';

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);

  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.currentRecordingId = null;
  recordingContext.stopRecordingResolve = null;
  recordingContext.stopRecordingReject = null;
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
  recordingContext.mediaRecorder = {
    state: 'recording',
    stop: recorderStop,
  } as never;
  recordingContext.artifactSession = {
    abort: artifactAbort,
    recorder: recordingContext.mediaRecorder,
    setLifecycleCallbacks: vi.fn(),
    start: vi.fn(),
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
  expect(recordingContext.mediaRecorder).toBeNull();
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
