import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  finalizeActiveSidecarRecordingsMock,
  finalizeRecordingMock,
  getSupportedMimeTypeMock,
  hasActiveSidecarSessionMock,
  notifyRecordingStoppedBestEffortMock,
  notifyVideoSavedToIdbBestEffortMock,
  startActiveSidecarRecordersMock,
  stopActiveSidecarRecordersWithFlushMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  finalizeActiveSidecarRecordingsMock: vi.fn(),
  finalizeRecordingMock: vi.fn(),
  getSupportedMimeTypeMock: vi.fn(),
  hasActiveSidecarSessionMock: vi.fn(),
  notifyRecordingStoppedBestEffortMock: vi.fn(),
  notifyVideoSavedToIdbBestEffortMock: vi.fn(),
  startActiveSidecarRecordersMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
}));

vi.mock('../stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stream')>();
  return {
    ...actual,
    createDesktopPreviewController: vi.fn(() => ({
      attachDesktopPreview: vi.fn(),
      detachDesktopPreview: vi.fn(),
    })),
    getSupportedMimeType: getSupportedMimeTypeMock,
  };
});

vi.mock('../finalizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../finalizer')>();
  return {
    ...actual,
    finalizeRecording: finalizeRecordingMock,
    notifyRecordingStoppedBestEffort: notifyRecordingStoppedBestEffortMock,
    notifyVideoSavedToIdbBestEffort: notifyVideoSavedToIdbBestEffortMock,
  };
});

vi.mock('../sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sidecar')>();
  return {
    ...actual,
    finalizeActiveSidecarRecordings: finalizeActiveSidecarRecordingsMock,
    getActiveSidecarWebcamSettings: vi.fn(() => null),
    hasActiveSidecarSession: hasActiveSidecarSessionMock,
    startActiveSidecarRecorders: startActiveSidecarRecordersMock,
    stopActiveSidecarRecordersWithFlush: stopActiveSidecarRecordersWithFlushMock,
  };
});

vi.mock('./cleanup', () => ({
  cleanupResources: cleanupResourcesMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../runtime-messaging/best-effort')>();
  return {
    ...actual,
    sendRuntimeMessageBestEffort: vi.fn(),
  };
});

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
    }),
  };
});

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoStream,
  getLastMediaRecorderInstance,
  installMediaRecorderMock,
} from './recorder.lifecycle.test-support';

function bootstrapRecorder() {
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: { quality: VideoQuality.HIGH } as never,
    captureWidth: 1280,
    captureHeight: 720,
    cursorCaptureMode: 'separate',
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  finalizeRecordingMock.mockResolvedValue(undefined);
  finalizeActiveSidecarRecordingsMock.mockResolvedValue(undefined);
  getSupportedMimeTypeMock.mockReturnValue('video/webm');
  hasActiveSidecarSessionMock.mockReturnValue(false);
  stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.recordedChunks = [];
});

function runLifecycleBootstrapSuite() {
  it('throws when the recording video stream is not initialized', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.beginRecordingSession('recording-1');

    expect(() => bootstrapRecorder()).toThrow('Recording video stream is not initialized');
  });

  it('falls back to the canonical recorder mime type for plain video streams', () => {
    installMediaRecorderMock([]);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-3');

    bootstrapRecorder();

    expect(getSupportedMimeTypeMock).toHaveBeenCalledOnce();
  });

  it('falls back to the canonical recorder mime type when no compatibility codec is supported', () => {
    installMediaRecorderMock([]);
    recordingContext.sourceStream = createVideoStream();
    recordingContext.videoStream = createVideoStream();
    recordingContext.beginRecordingSession('recording-4');

    bootstrapRecorder();

    expect(getSupportedMimeTypeMock).toHaveBeenCalledOnce();
  });
}

function registerCleanFinalizeTest() {
  it('persists non-empty data chunks and finalizes cleanly on stop', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const resolveStop = vi.fn();
    const rejectStop = vi.fn();
    recordingContext.stopRecordingResolve = resolveStop;
    recordingContext.stopRecordingReject = rejectStop;

    bootstrapRecorder();

    getLastMediaRecorderInstance()?.ondataavailable?.({ data: { size: 10 } });
    await getLastMediaRecorderInstance()?.onstop?.();

    expect(finalizeRecordingMock).toHaveBeenCalledWith(
      [{ size: 10 }],
      'recording-1',
      undefined,
      false,
      { notifySaved: true, notifyStopped: true }
    );
    expect(stopActiveSidecarRecordersWithFlushMock).toHaveBeenCalledOnce();
    expect(cleanupResourcesMock).toHaveBeenCalled();
    expect(resolveStop).toHaveBeenCalledOnce();
    expect(rejectStop).not.toHaveBeenCalled();
  });
}

function registerFinalizeFailureTest() {
  it('ignores empty chunks and rejects when finalizeRecording fails', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    finalizeRecordingMock.mockRejectedValueOnce(new Error('finalize failed'));
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const resolveStop = vi.fn();
    const rejectStop = vi.fn();
    recordingContext.stopRecordingResolve = resolveStop;
    recordingContext.stopRecordingReject = rejectStop;

    bootstrapRecorder();

    getLastMediaRecorderInstance()?.ondataavailable?.({ data: { size: 0 } });
    await getLastMediaRecorderInstance()?.onstop?.();

    expect(finalizeRecordingMock).toHaveBeenCalledWith([], 'recording-1', undefined, false, {
      notifySaved: true,
      notifyStopped: true,
    });
    expect(cleanupResourcesMock).toHaveBeenCalled();
    expect(resolveStop).not.toHaveBeenCalled();
    expect(rejectStop).toHaveBeenCalledWith(expect.any(Error));
  });
}

function registerSidecarFinalizeTest() {
  it('waits for sidecar flush and sends one stopped notification after sidecar save', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    let resolveSidecarStop!: () => void;
    const sidecarStopPromise = new Promise<void>((resolve) => {
      resolveSidecarStop = resolve;
    });
    stopActiveSidecarRecordersWithFlushMock.mockReturnValueOnce(sidecarStopPromise);
    hasActiveSidecarSessionMock.mockReturnValueOnce(true);
    finalizeRecordingMock.mockResolvedValueOnce({
      filename: 'recording.webm',
      recordingId: 'recording-1',
    });
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const resolveStop = vi.fn();
    recordingContext.stopRecordingResolve = resolveStop;

    bootstrapRecorder();

    const stopPromise = getLastMediaRecorderInstance()?.onstop?.();
    await Promise.resolve();
    expect(finalizeRecordingMock).not.toHaveBeenCalled();

    resolveSidecarStop();
    await stopPromise;

    expect(finalizeRecordingMock).toHaveBeenCalledWith([], 'recording-1', undefined, false, {
      notifySaved: false,
      notifyStopped: false,
    });
    expect(finalizeActiveSidecarRecordingsMock).toHaveBeenCalledWith(false);
    expect(notifyVideoSavedToIdbBestEffortMock).toHaveBeenCalledWith(
      'recording-1',
      'recording.webm'
    );
    expect(notifyRecordingStoppedBestEffortMock).toHaveBeenCalledWith(
      'recording-finalized-with-sidecars',
      'recording-1'
    );
    expect(resolveStop).toHaveBeenCalledOnce();
  });
}

function runLifecycleErrorSuite() {
  it('rejects with the recorder error when MediaRecorder emits an error event', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const rejectStop = vi.fn();
    recordingContext.stopRecordingReject = rejectStop;

    bootstrapRecorder();

    getLastMediaRecorderInstance()?.onerror?.({ error: new Error('recorder failed') });

    expect(cleanupResourcesMock).toHaveBeenCalled();
    expect(rejectStop).toHaveBeenCalledWith(expect.any(Error));
  });
}

describe('offscreen-recording-start-recorder lifecycle', () => {
  runLifecycleBootstrapSuite();
  registerCleanFinalizeTest();
  registerFinalizeFailureTest();
  registerSidecarFinalizeTest();
  runLifecycleErrorSuite();
});
