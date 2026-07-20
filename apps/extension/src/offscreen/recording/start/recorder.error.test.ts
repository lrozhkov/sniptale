import { beforeEach, describe, expect, it, vi } from 'vitest';

const { finalizeRecordingMock, getSupportedMimeTypeMock, sendRuntimeMessageMock } = vi.hoisted(
  () => ({
    finalizeRecordingMock: vi.fn(),
    getSupportedMimeTypeMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  })
);

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

vi.mock('../stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stream')>();
  return {
    ...actual,
    getSupportedMimeType: getSupportedMimeTypeMock,
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
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

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
  getSupportedMimeTypeMock.mockReturnValue('video/webm;codecs=vp9');
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
  it('rejects the pending stop request without rethrowing when finalization fails', async () => {
    const finalizeError = new Error('save failed');
    const rejectStopRecording = vi.fn();

    finalizeRecordingMock.mockRejectedValueOnce(finalizeError);
    recordingContext.beginRecordingSession('recording-failure');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-failure',
      settings: { quality: VideoQuality.HIGH } as never,
      captureWidth: 1920,
      captureHeight: 1080,
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: {
        reset: vi.fn(),
        startSegment: vi.fn(),
      } as never,
    });
    recordingContext.beginStopRequest({
      reject: rejectStopRecording,
      resolve: vi.fn(),
    });

    await expect(lastMediaRecorderInstance?.onstop?.()).resolves.toBeUndefined();

    expect(rejectStopRecording).toHaveBeenCalledWith(finalizeError);
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
      settings: { quality: VideoQuality.HIGH } as never,
      captureWidth: 1920,
      captureHeight: 1080,
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: {
        reset: vi.fn(),
        startSegment: vi.fn(),
      } as never,
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
      settings: { quality: VideoQuality.HIGH } as never,
      captureWidth: 1920,
      captureHeight: 1080,
      trackSettings: { width: 1920, height: 1080, frameRate: 30 },
      durationTracker: {
        reset: vi.fn(),
        startSegment: vi.fn(),
      } as never,
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

function registerDisplaySurfaceMetadataTest() {
  it('omits null cursor mode while preserving verified display surface metadata', () => {
    recordingContext.beginRecordingSession('recording-surface');

    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-surface',
      settings: { quality: VideoQuality.HIGH } as never,
      captureWidth: 1920,
      captureHeight: 1080,
      cursorCaptureMode: null,
      trackSettings: {
        displaySurface: 'window',
        frameRate: 30,
        height: 1080,
        width: 1920,
      },
      durationTracker: {
        reset: vi.fn(),
        startSegment: vi.fn(),
      } as never,
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
  registerDisplaySurfaceMetadataTest();
});
