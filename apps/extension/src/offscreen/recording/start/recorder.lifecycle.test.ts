import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  finalizeActiveSidecarRecordingsMock,
  finalizeRecordingMock,
  hasActiveSidecarSessionMock,
  notifyRecordingStoppedBestEffortMock,
  notifyVideoSavedToIdbBestEffortMock,
  sendRuntimeMessageMock,
  startActiveSidecarRecordersMock,
  stopActiveSidecarRecordersWithFlushMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  finalizeActiveSidecarRecordingsMock: vi.fn(),
  finalizeRecordingMock: vi.fn(),
  hasActiveSidecarSessionMock: vi.fn(),
  notifyRecordingStoppedBestEffortMock: vi.fn(),
  notifyVideoSavedToIdbBestEffortMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startActiveSidecarRecordersMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
}));

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
    sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
  };
});

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  };
});

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoStream,
  getLastMediaRecorderInstance,
  installMediaRecorderMock,
} from './recorder.lifecycle.test-support';

function bootstrapRecorder() {
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: {
      output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
      quality: VideoQuality.HIGH,
    } as never,
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

  it('rejects an unavailable selected codec for plain video streams', () => {
    installMediaRecorderMock([]);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-3');

    expect(() => bootstrapRecorder()).toThrow(
      'selected recording container and codec are not supported'
    );
  });

  it('uses the selected codec consistently for a derived output stream', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    recordingContext.sourceStream = createVideoStream();
    recordingContext.videoStream = createVideoStream();
    recordingContext.beginRecordingSession('recording-4');

    bootstrapRecorder();
  });
}

function registerCleanFinalizeTest() {
  it('persists non-empty data chunks and finalizes cleanly on stop', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    recordingContext.recordedChunks = [new Blob(['stale'])];
    const resolveStop = vi.fn();
    const rejectStop = vi.fn();
    bootstrapRecorder();
    recordingContext.beginStopRequest({ reject: rejectStop, resolve: resolveStop });

    expect(recordingContext.recordedChunks).toEqual([]);
    expect(getLastMediaRecorderInstance()?.start).toHaveBeenCalledWith(1000);
    expect(startActiveSidecarRecordersMock).toHaveBeenCalledWith(1000, expect.any(Function));
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
  it('ignores empty chunks and resolves one terminal outcome when finalization fails', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    finalizeRecordingMock.mockRejectedValueOnce(new Error('finalize failed'));
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const resolveStop = vi.fn();
    const rejectStop = vi.fn();
    bootstrapRecorder();
    recordingContext.beginStopRequest({ reject: rejectStop, resolve: resolveStop });

    getLastMediaRecorderInstance()?.ondataavailable?.({ data: { size: 0 } });
    await getLastMediaRecorderInstance()?.onstop?.();

    expect(finalizeRecordingMock).toHaveBeenCalledWith([], 'recording-1', undefined, false, {
      notifySaved: true,
      notifyStopped: true,
    });
    expect(cleanupResourcesMock).toHaveBeenCalled();
    expect(resolveStop).toHaveBeenCalledWith({
      error: 'finalize failed',
      result: 'terminal-failure',
    });
    expect(rejectStop).not.toHaveBeenCalled();
  });
}

function registerSidecarFinalizeTest() {
  it('waits for sidecar flush and sends one stopped notification after sidecar save', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
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
    bootstrapRecorder();
    recordingContext.beginStopRequest({ reject: vi.fn(), resolve: resolveStop });

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
  it('resolves the bound stop with the recorder error when MediaRecorder emits an error', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    const rejectStop = vi.fn();
    const resolveStop = vi.fn();
    bootstrapRecorder();
    recordingContext.beginStopRequest({ reject: rejectStop, resolve: resolveStop });

    getLastMediaRecorderInstance()?.onerror?.({ error: new Error('recorder failed') });

    expect(cleanupResourcesMock).toHaveBeenCalled();
    expect(resolveStop).toHaveBeenCalledWith({
      error: 'recorder failed',
      result: 'terminal-failure',
    });
    expect(rejectStop).not.toHaveBeenCalled();
  });
}

function runNativeActivationAuthoritySuite() {
  it('publishes started state only after the native recorder start event', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9'], { emitStartEvent: false });
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();

    expect(recordingContext.lifecycleState).toBe('starting');
    expect(startActiveSidecarRecordersMock).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );

    getLastMediaRecorderInstance()?.onstart?.();

    expect(recordingContext.lifecycleState).toBe('recording');
    expect(startActiveSidecarRecordersMock).toHaveBeenCalledWith(1000, expect.any(Function));
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );
  });

  it('reports an encoder error before native start as a visible start failure', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9'], { emitStartEvent: false });
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();
    getLastMediaRecorderInstance()?.onerror?.({ error: new Error('vp9 allocation failed') });

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          error: 'vp9 allocation failed',
          phase: 'start',
          recordingId: 'recording-1',
          type: 'OFFSCREEN_ERROR',
        },
      })
    );
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );
    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  });

  it('cannot activate or publish after a starting recorder is cancelled', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9'], { emitStartEvent: false });
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();
    const nativeStart = getLastMediaRecorderInstance()?.onstart;
    expect(recordingContext.cancelStartingRecorder()).toBe(true);
    nativeStart?.();

    expect(recordingContext.lifecycleState).toBe('stopping');
    expect(startActiveSidecarRecordersMock).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );
  });

  it('does not finalize a recorder that stops without an explicit stop request', async () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();
    await getLastMediaRecorderInstance()?.onstop?.();

    expect(finalizeRecordingMock).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'The recording stopped unexpectedly.',
          phase: 'runtime',
          type: 'OFFSCREEN_ERROR',
        }),
      })
    );
    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  });

  it('turns a synchronous sidecar encoder failure into a visible start failure', () => {
    installMediaRecorderMock(['video/webm;codecs=vp9']);
    startActiveSidecarRecordersMock.mockImplementationOnce(
      (_timeslice: number, onFailure: (error: Error) => void) => {
        onFailure(new Error('webcam encoder failed'));
      }
    );
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'webcam encoder failed',
          phase: 'start',
          type: 'OFFSCREEN_ERROR',
        }),
      })
    );
    expect(recordingContext.lifecycleState).toBe('starting');
  });
}

describe('offscreen-recording-start-recorder lifecycle', () => {
  runLifecycleBootstrapSuite();
  registerCleanFinalizeTest();
  registerFinalizeFailureTest();
  registerSidecarFinalizeTest();
  runLifecycleErrorSuite();
  runNativeActivationAuthoritySuite();
});
