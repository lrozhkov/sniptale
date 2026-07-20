import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  getActiveMultiSourceRecordingIdMock,
  hasActiveSidecarSessionMock,
  loggerDebugMock,
  hasActiveMultiSourceRecordingMock,
  sendRuntimeMessageMock,
  startRecordingImplMock,
  stopActiveSidecarRecordersWithFlushMock,
  translateMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  getActiveMultiSourceRecordingIdMock: vi.fn(),
  hasActiveSidecarSessionMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('./start/index', () => ({
  cleanupResources: cleanupResourcesMock,
  startRecording: startRecordingImplMock,
}));

vi.mock('./multi-source', () => ({
  cancelPendingMultiSourceRecordingStart: vi.fn(),
  getActiveMultiSourceRecordingId: getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecording: vi.fn(),
  resumeMultiSourceRecording: vi.fn(),
  startMultiSourceRecording: vi.fn(),
  stopMultiSourceRecording: vi.fn(),
  updateMultiSourceRecordingSettings: vi.fn(),
}));

vi.mock('./sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sidecar')>();
  return {
    ...actual,
    hasActiveSidecarSession: hasActiveSidecarSessionMock,
    pauseActiveSidecarRecorders: vi.fn(),
    resumeActiveSidecarRecorders: vi.fn(),
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

function createLoggerMock() {
  return { createLogger: () => ({ debug: loggerDebugMock }) };
}

vi.mock('@sniptale/platform/observability/logger', () => createLoggerMock());

import {
  pauseRecording,
  resumeRecording,
  setViewportDrawState,
  startRecording,
  stopRecording,
  updateViewportCrop,
} from './controller';
import { recordingContext } from './context';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDurationTracker() {
  return {
    freeze: vi.fn(),
    getElapsedSeconds: vi.fn(() => 12),
    publishDuration: vi.fn(),
    startSegment: vi.fn(),
    stop: vi.fn(),
    stopSegment: vi.fn(),
  };
}

function useRecordingControllerTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    sendRuntimeMessageMock.mockResolvedValue(undefined);
    getActiveMultiSourceRecordingIdMock.mockReturnValue('recording-multi');
    hasActiveMultiSourceRecordingMock.mockReturnValue(false);
    hasActiveSidecarSessionMock.mockReturnValue(false);
    stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
    recordingContext.resetRecordingSession();
    recordingContext.mediaRecorder = null;
    recordingContext.videoStream = null;
    recordingContext.currentRecordingId = null;
    recordingContext.sourceStream = null;
    recordingContext.stopRecordingResolve = null;
    recordingContext.stopRecordingReject = null;
    recordingContext.durationTracker = createDurationTracker() as never;
  });
}

async function verifiesPausedNotificationFailureTrace() {
  const pause = vi.fn();
  recordingContext.beginRecordingSession('recording-race');
  recordingContext.mediaRecorder = {
    pause,
    state: 'recording',
  } as never;
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));

  pauseRecording();
  await flushPromises();

  expect(pause).toHaveBeenCalledOnce();
  expect(recordingContext.durationTracker.freeze).toHaveBeenCalledOnce();
  expect(recordingContext.durationTracker.stopSegment).toHaveBeenCalledOnce();
  expect(recordingContext.durationTracker.publishDuration).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    recordingId: 'recording-race',
  });
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime that recording paused',
    expect.objectContaining({
      errorMessage: 'popup closed',
      recordingId: 'recording-race',
    })
  );
}

async function verifiesResumedNotificationFailureTrace() {
  const resume = vi.fn();
  recordingContext.beginRecordingSession('recording-race');
  recordingContext.mediaRecorder = {
    resume,
    state: 'paused',
  } as never;
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup reopened'));

  resumeRecording();
  await flushPromises();

  expect(resume).toHaveBeenCalledOnce();
  expect(recordingContext.durationTracker.startSegment).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    recordingId: 'recording-race',
  });
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime that recording resumed',
    expect.objectContaining({
      errorMessage: 'popup reopened',
      recordingId: 'recording-race',
    })
  );
}

async function verifiesStartDelegation() {
  const params = { streamId: 'stream-1' } as never;
  startRecordingImplMock.mockResolvedValueOnce(undefined);

  await expect(startRecording(params)).resolves.toBeUndefined();

  expect(startRecordingImplMock).toHaveBeenCalledWith(params);
}

async function verifiesStartGuardAgainstExistingSessions() {
  recordingContext.beginRecordingSession('recording-1');

  await expect(startRecording({ streamId: 'stream-2' } as never)).rejects.toThrow(
    't:background.runtime.recordingAlreadyRunning'
  );

  expect(startRecordingImplMock).not.toHaveBeenCalled();
}

async function verifiesActiveStopFlow() {
  const requestData = vi.fn();
  const stop = vi.fn();
  const mediaRecorder = {
    requestData,
    state: 'recording',
    stop,
  } as never;
  recordingContext.beginRecordingSession('recording-1');
  recordingContext.activateRecorder(mediaRecorder);

  const promise = stopRecording();

  expect(recordingContext.durationTracker.freeze).toHaveBeenCalledOnce();
  expect(recordingContext.durationTracker.stopSegment).toHaveBeenCalledOnce();
  expect(requestData).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
  expect(stopActiveSidecarRecordersWithFlushMock).toHaveBeenCalledOnce();
  expect(recordingContext.stopRecordingResolve).not.toBeNull();

  recordingContext.stopRecordingResolve?.();
  await expect(promise).resolves.toBeUndefined();
}

async function verifiesStopTimeoutPath() {
  vi.useFakeTimers();
  const mediaRecorder = {
    state: 'recording',
    stop: vi.fn(),
  } as never;
  recordingContext.beginRecordingSession('recording-timeout');
  recordingContext.activateRecorder(mediaRecorder);

  const pendingStop = stopRecording();
  const rejection = expect(pendingStop).rejects.toThrow(
    't:background.runtime.recordingStopTimeout'
  );

  await vi.advanceTimersByTimeAsync(10_000);
  await rejection;

  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  vi.useRealTimers();
}

function verifiesViewportCropRouting() {
  const updateViewportPresetCrop = vi.fn();
  recordingContext.updateViewportPresetCrop = updateViewportPresetCrop;

  updateViewportCrop({
    targetResolution: { width: 1920, height: 1080 },
    viewportSizeInPixels: { width: 960, height: 540 },
  });

  expect(updateViewportPresetCrop).toHaveBeenCalledWith({
    targetResolution: { width: 1920, height: 1080 },
    viewportSizeInPixels: { width: 960, height: 540 },
  });
}

function verifiesViewportDrawStateEpochGuard() {
  const updateViewportPresetDrawState = vi.fn();
  recordingContext.updateViewportPresetDrawState = updateViewportPresetDrawState;
  recordingContext.viewportNavigationEpoch = 12;

  setViewportDrawState({ frozen: false, navigationEpoch: 11 });
  expect(updateViewportPresetDrawState).not.toHaveBeenCalled();

  setViewportDrawState({ frozen: true, navigationEpoch: 13 });
  expect(recordingContext.viewportNavigationEpoch).toBe(13);
  expect(recordingContext.viewportDrawFrozen).toBe(true);
  expect(updateViewportPresetDrawState).toHaveBeenCalledWith({
    frozen: true,
    navigationEpoch: 13,
  });
}

describe('offscreen-recording-controller', () => {
  useRecordingControllerTestScope();

  it('delegates recording start to the owned bootstrap implementation', verifiesStartDelegation);
  it(
    'rejects duplicate offscreen starts when a recording session is already active',
    verifiesStartGuardAgainstExistingSessions
  );
  it(
    'logs paused notification failures without breaking the pause flow',
    verifiesPausedNotificationFailureTrace
  );
  it(
    'logs resumed notification failures without breaking the resume flow',
    verifiesResumedNotificationFailureTrace
  );
  it(
    'stops an active recorder and resolves through the owned stop callback',
    verifiesActiveStopFlow
  );
  it('fails stop requests that never complete in offscreen', verifiesStopTimeoutPath);
  it('routes viewport crop updates through the cached updater', verifiesViewportCropRouting);
  it(
    'ignores stale viewport draw updates and applies the latest navigation epoch',
    verifiesViewportDrawStateEpochGuard
  );
});
