import { beforeEach, describe, expect, it, vi } from 'vitest';

const { finalizeRecordingMock, getSupportedRecordingMimeTypeMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    finalizeRecordingMock: vi.fn(),
    getSupportedRecordingMimeTypeMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../finalizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../finalizer')>();
  return {
    ...actual,
    finalizeRecording: finalizeRecordingMock,
    notifyRecordingStoppedBestEffort: vi.fn(),
  };
});

vi.mock('../sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sidecar')>();
  return {
    ...actual,
    cleanupActiveSidecarRecorders: vi.fn(),
    finalizeActiveSidecarRecordings: vi.fn(),
    getActiveSidecarWebcamSettings: vi.fn(() => null),
    hasActiveSidecarSession: vi.fn(() => false),
    startActiveSidecarRecorders: vi.fn(),
    stopActiveSidecarRecordersWithFlush: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../recorder-mime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recorder-mime')>();
  return {
    ...actual,
    getSupportedRecordingMimeType: getSupportedRecordingMimeTypeMock,
  };
});

vi.mock('../setup/desktop-media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../setup/desktop-media')>();
  return {
    ...actual,
    detachCachedPreview: vi.fn(),
  };
});

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
      info: vi.fn(),
    }),
  };
});

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';
import { createSettings } from './helpers.test-support';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

type MediaRecorderMockInstance = {
  onerror: ((event: Event) => void) | null;
  onstop: (() => Promise<void>) | null;
};

let lastMediaRecorderInstance: MediaRecorderMockInstance | null = null;

function installMediaRecorderMock() {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn(() => false);

    ondataavailable: ((event: { data?: Blob | null }) => void) | null = null;
    onstop: (() => Promise<void>) | null = null;
    onerror: ((event: Event) => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;

    constructor(
      _stream: MediaStream,
      readonly _config: {
        mimeType: string;
        videoBitsPerSecond: number;
      }
    ) {
      this.mimeType = _config.mimeType;
      lastMediaRecorderInstance = this as unknown as MediaRecorderMockInstance;
    }
  }

  Object.assign(globalThis, {
    MediaRecorder: MediaRecorderMock,
  });
}

function createVideoStream() {
  return {
    getAudioTracks: () => [],
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  installMediaRecorderMock();
  getSupportedRecordingMimeTypeMock.mockReturnValue('video/webm;codecs=vp9');
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  finalizeRecordingMock.mockResolvedValue(undefined);
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = createVideoStream();
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.recordedChunks = [];
  recordingContext.stopRecordingResolve = null;
  recordingContext.stopRecordingReject = null;
});

function registerFinalizeFailureTest() {
  it('returns one terminal stop outcome when finalization fails after recorder shutdown', async () => {
    const finalizeError = new Error('save failed');
    const rejectStopRecording = vi.fn();
    const resolveStopRecording = vi.fn();

    finalizeRecordingMock.mockRejectedValueOnce(finalizeError);
    recordingContext.beginRecordingSession('recording-failure');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-failure',
      settings: createSettings(),
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: recordingContext.durationTracker,
    });
    recordingContext.beginStopRequest({
      reject: rejectStopRecording,
      resolve: resolveStopRecording,
    });

    await expect(lastMediaRecorderInstance?.onstop?.()).resolves.toBeUndefined();

    expect(resolveStopRecording).toHaveBeenCalledWith({
      error: 'save failed',
      result: 'terminal-failure',
    });
    expect(rejectStopRecording).not.toHaveBeenCalled();
    expect(recordingContext.videoStream).toBeNull();
    expect(recordingContext.mediaRecorder).toBeNull();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logMessage: 'Failed to notify runtime that recording started',
        payload: {
          type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
          recordingId: 'recording-failure',
        },
      })
    );
  });
}

function registerRecorderErrorFallbackTest() {
  it('uses a fallback error when MediaRecorder error events omit native errors', () => {
    const rejectStopRecording = vi.fn();
    recordingContext.beginRecordingSession('recording-error');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-error',
      settings: createSettings(),
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: recordingContext.durationTracker,
    });
    recordingContext.stopRecordingReject = rejectStopRecording;

    lastMediaRecorderInstance?.onerror?.({} as Event);

    expect(rejectStopRecording).toHaveBeenCalledWith(expect.any(Error));
    expect(rejectStopRecording.mock.calls[0]?.[0]).toEqual(
      new Error('The recording failed to stop cleanly.')
    );
  });
}

function registerRecorderErrorTerminalNotificationTest() {
  it('reports recorder errors as terminal runtime failures without a pending stop request', () => {
    recordingContext.beginRecordingSession('recording-runtime-error');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-runtime-error',
      settings: createSettings(),
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: recordingContext.durationTracker,
    });

    lastMediaRecorderInstance?.onerror?.({ error: new Error('encoder failed') } as ErrorEvent);

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logMessage: 'Failed to notify runtime about recording runtime failure',
        payload: {
          type: VideoMessageType.OFFSCREEN_ERROR,
          error: 'encoder failed',
          phase: 'stop',
          recordingId: 'recording-runtime-error',
        },
      })
    );
    expect(recordingContext.mediaRecorder).toBeNull();
    expect(recordingContext.videoStream).toBeNull();
  });
}

function registerRecorderErrorStopOrderingTest() {
  it('returns a terminal bound-stop outcome without emitting an independent stop error', () => {
    const resolveStop = vi.fn();
    const rejectStop = vi.fn();
    recordingContext.beginRecordingSession('recording-stop-error');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-stop-error',
      settings: createSettings(),
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: recordingContext.durationTracker,
    });
    recordingContext.beginStopRequest({ reject: rejectStop, resolve: resolveStop });

    lastMediaRecorderInstance?.onerror?.({ error: new Error('encoder failed') } as ErrorEvent);

    expect(resolveStop).toHaveBeenCalledWith({
      error: 'encoder failed',
      result: 'terminal-failure',
    });
    expect(rejectStop).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: VideoMessageType.OFFSCREEN_ERROR }),
      })
    );
  });
}

function registerDisplaySurfaceMetadataTest() {
  it('omits null cursor mode while preserving verified display surface metadata', () => {
    recordingContext.beginRecordingSession('recording-surface');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-surface',
      settings: createSettings(),
      cursorCaptureMode: null,
      trackSettings: {
        displaySurface: 'window',
        frameRate: 30,
        height: 1080,
        width: 1920,
      },
      durationTracker: recordingContext.durationTracker,
    });

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          displaySurface: 'window',
          recordingId: 'recording-surface',
          type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        },
      })
    );
  });
}

describe('offscreen-recording-start-recorder error paths', () => {
  registerFinalizeFailureTest();
  registerRecorderErrorFallbackTest();
  registerRecorderErrorTerminalNotificationTest();
  registerRecorderErrorStopOrderingTest();
  registerDisplaySurfaceMetadataTest();
});
