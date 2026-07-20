import { beforeEach, expect, it, vi } from 'vitest';
import {
  createSettings,
  createTrack,
  createVideoStream,
  installMediaRecorderMock,
  mediaRecorderTestState,
} from './helpers.test-support';

const {
  detachCachedPreviewMock,
  finalizeRecordingMock,
  getActiveSidecarWebcamSettingsMock,
  getSupportedMimeTypeMock,
  loggerErrorMock,
  loggerWarnMock,
  logOffscreenDebugErrorMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  detachCachedPreviewMock: vi.fn(),
  finalizeRecordingMock: vi.fn(),
  getActiveSidecarWebcamSettingsMock: vi.fn((): { height: number; width: number } | null => null),
  getSupportedMimeTypeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  logOffscreenDebugErrorMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

function createMock<T extends object>(value: T): T {
  return value;
}

function createFinalizerMock() {
  return { finalizeRecording: finalizeRecordingMock, notifyRecordingStoppedBestEffort: vi.fn() };
}

function createSidecarMock() {
  return {
    cleanupActiveSidecarRecorders: vi.fn(),
    finalizeActiveSidecarRecordings: vi.fn(),
    getActiveSidecarWebcamSettings: getActiveSidecarWebcamSettingsMock,
    hasActiveSidecarSession: vi.fn(() => false),
    startActiveSidecarRecorders: vi.fn(),
    stopActiveSidecarRecordersWithFlush: vi.fn(() => Promise.resolve()),
  };
}

function createLoggerMock() {
  return {
    createLogger: () => ({
      debug: vi.fn(),
      error: loggerErrorMock,
      info: vi.fn(),
      warn: loggerWarnMock,
    }),
  };
}

vi.mock('../finalizer', () => createFinalizerMock());
vi.mock('../sidecar', () => createSidecarMock());
vi.mock('../setup/desktop-media', () =>
  createMock({ detachCachedPreview: detachCachedPreviewMock })
);
vi.mock('../../runtime-messaging/best-effort', () =>
  createMock({
    logOffscreenDebugError: logOffscreenDebugErrorMock,
    sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
  })
);
vi.mock('@sniptale/platform/observability/logger', () => createLoggerMock());
vi.mock('../stream', () => createMock({ getSupportedMimeType: getSupportedMimeTypeMock }));

import {
  cleanupResources,
  finalizeRecordingBootstrap,
  handleRecordingStartError,
  initializeRecordingSession,
} from './helpers';
import { recordingContext } from '../context';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

beforeEach(() => {
  vi.clearAllMocks();
  installMediaRecorderMock(false);
  getSupportedMimeTypeMock.mockReturnValue('video/webm;codecs=vp9');
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  finalizeRecordingMock.mockResolvedValue(undefined);

  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.recordedChunks = [];
  recordingContext.updateViewportPresetCrop = vi.fn();
  recordingContext.updateViewportPresetDrawState = vi.fn();
  recordingContext.viewportDrawFrozen = true;
  recordingContext.viewportNavigationEpoch = 9;
  recordingContext.currentRecordingId = null;
  recordingContext.stopRecordingResolve = null;
  recordingContext.stopRecordingReject = null;
});

it('uses provided recording ids and generates fallback ids when missing', () => {
  expect(
    initializeRecordingSession({
      settings: createSettings(),
      streamId: 'stream-1',
      recordingId: 'recording-1',
    })
  ).toBe('recording-1');
  recordingContext.resetRecordingSession();

  const generatedId = initializeRecordingSession({
    settings: createSettings(),
    streamId: 'stream-2',
  });

  expect(generatedId).toMatch(/^rec-/);
  expect(recordingContext.currentRecordingId).toBe(generatedId);
});

it('cleans up mixers, streams, and recorder stop failures without throwing', async () => {
  const cleanupError = new Error('cleanup failed');
  const sourceTrackStop = vi.fn();
  const videoTrackStop = vi.fn();
  const recorderStop = vi.fn(() => {
    throw new Error('stop failed');
  });

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

  cleanupResources();
  await Promise.resolve();

  expect(detachCachedPreviewMock).toHaveBeenCalledOnce();
  expect(sourceTrackStop).toHaveBeenCalledOnce();
  expect(videoTrackStop).toHaveBeenCalledOnce();
  expect(recorderStop).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Audio mixer cleanup failed', cleanupError);
  expect(logOffscreenDebugErrorMock).toHaveBeenCalledWith(
    expect.any(Object),
    'Failed to stop MediaRecorder during cleanup',
    expect.any(Error)
  );
  expect(recordingContext.sourceStream).toBeNull();
  expect(recordingContext.videoStream).toBeNull();
  expect(recordingContext.mediaRecorder).toBeNull();
  expect(recordingContext.viewportDrawFrozen).toBe(false);
  expect(recordingContext.viewportNavigationEpoch).toBe(0);
});

it('bootstraps recording with fallback mime types and resolves the stop waiter', async () => {
  const durationTracker = createDurationTracker();
  const videoTrackStop = vi.fn();
  const resolveStopRecording = vi.fn();

  recordingContext.videoStream = createVideoStream({ trackStop: videoTrackStop });
  recordingContext.recordedChunks = [new Blob(['stale'])];
  recordingContext.beginRecordingSession('recording-1');

  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: createSettings(undefined),
    captureWidth: undefined,
    captureHeight: undefined,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: durationTracker as never,
  });
  recordingContext.beginStopRequest({
    reject: vi.fn(),
    resolve: resolveStopRecording,
  });
  mediaRecorderTestState.lastInstance?.ondataavailable?.({
    data: new Blob(['chunk']),
  });
  await mediaRecorderTestState.lastInstance?.onstop?.();

  expect(getSupportedMimeTypeMock).toHaveBeenCalledOnce();
  expect(mediaRecorderTestState.lastInstance?.config.mimeType).toBe('video/webm;codecs=vp9');
  expect(mediaRecorderTestState.lastInstance?.start).toHaveBeenCalledWith(1000);
  expect(videoTrackStop).toHaveBeenCalledOnce();
  expect(resolveStopRecording).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      logMessage: 'Failed to notify runtime that recording started',
      payload: {
        type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        recordingId: 'recording-1',
      },
    })
  );
  expect(finalizeRecordingMock).toHaveBeenCalledWith(
    expect.any(Array),
    'recording-1',
    undefined,
    false,
    { notifySaved: true, notifyStopped: true }
  );
  expect(recordingContext.recordedChunks).toEqual([]);
});

it('forwards verified cursor capture mode into the runtime start message', () => {
  const durationTracker = createDurationTracker();
  getActiveSidecarWebcamSettingsMock.mockReturnValueOnce({ height: 720, width: 1280 });
  recordingContext.videoStream = createVideoStream();
  recordingContext.beginRecordingSession('recording-3');

  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-3',
    settings: createSettings(undefined),
    captureWidth: 1280,
    captureHeight: 720,
    cursorCaptureMode: 'separate',
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: durationTracker as never,
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        recordingId: 'recording-3',
        cursorCaptureMode: 'separate',
        webcamSettings: { height: 720, width: 1280 },
      },
    })
  );
});

it('uses supported recorder mime types and ignores empty data chunks', () => {
  installMediaRecorderMock(true);
  const durationTracker = createDurationTracker();

  recordingContext.videoStream = createVideoStream();
  recordingContext.recordedChunks = [];
  recordingContext.beginRecordingSession('recording-2');

  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-2',
    settings: createSettings(VideoQuality.MEDIUM),
    captureWidth: 1920,
    captureHeight: 1080,
    trackSettings: { width: 800, height: 600, frameRate: 60 },
    durationTracker: durationTracker as never,
  });

  mediaRecorderTestState.lastInstance?.ondataavailable?.({
    data: new Blob([]),
  });

  expect(getSupportedMimeTypeMock).not.toHaveBeenCalled();
  expect(recordingContext.recordedChunks).toEqual([]);
  expect(mediaRecorderTestState.lastInstance?.config.mimeType).toContain('video/mp4');
});

function createDurationTracker() {
  return {
    reset: vi.fn(),
    startSegment: vi.fn(),
  };
}

it('reports start errors and delegates to cleanup', () => {
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
