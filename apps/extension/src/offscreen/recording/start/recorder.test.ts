import { beforeEach, describe, expect, it, vi } from 'vitest';

// State-machine proof: terminal recorder lifecycle emits start/failure/cancel events through owners.
const { getSupportedMimeTypeMock, loggerDebugMock, loggerInfoMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    getSupportedMimeTypeMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    info: loggerInfoMock,
  }),
}));

vi.mock('../stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream')>()),
  createDesktopPreviewController: vi.fn(() => ({
    attachDesktopPreview: vi.fn(),
    detachDesktopPreview: vi.fn(),
  })),
  getSupportedMimeType: getSupportedMimeTypeMock,
}));

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

type MediaRecorderMockInstance = {
  config: {
    mimeType: string;
    videoBitsPerSecond: number;
  };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: 'inactive' | 'recording';
};

let lastMediaRecorderInstance: MediaRecorderMockInstance | null = null;

function installMediaRecorderMock(supportedMimeTypes: string[]) {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn((mimeType: string) => supportedMimeTypes.includes(mimeType));

    ondataavailable = null;
    onerror = null;
    onstop = null;
    start = vi.fn(() => {
      this.state = 'recording';
    });
    stop = vi.fn(() => {
      this.state = 'inactive';
    });
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;

    constructor(
      _stream: MediaStream,
      readonly config: {
        audioBitsPerSecond?: number;
        mimeType: string;
        videoBitsPerSecond: number;
      }
    ) {
      this.mimeType = config.mimeType;
      lastMediaRecorderInstance = this as unknown as MediaRecorderMockInstance;
    }
  }

  Object.assign(globalThis, {
    MediaRecorder: MediaRecorderMock,
  });
}

function createVideoStream(audioTrackCount = 0) {
  return {
    getAudioTracks: () =>
      Array.from({ length: audioTrackCount }, () => ({ kind: 'audio' as const })),
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

function bootstrapRecorder() {
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: { quality: VideoQuality.HIGH } as never,
    captureWidth: 1280,
    captureHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

function bootstrapRecorderWithCursorMode(cursorCaptureMode: 'separate' | 'embedded-fallback') {
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: { quality: VideoQuality.HIGH } as never,
    captureWidth: 1280,
    captureHeight: 720,
    cursorCaptureMode,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

function bootstrapRecorderWithSurface(displaySurface: string | undefined) {
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: { quality: VideoQuality.HIGH } as never,
    captureWidth: 1280,
    captureHeight: 720,
    cursorCaptureMode: 'separate',
    trackSettings: {
      width: 1280,
      height: 720,
      frameRate: 30,
      ...(displaySurface === undefined ? {} : { displaySurface }),
    },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

function registerRecorderTestSetup() {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupportedMimeTypeMock.mockReturnValue('video/webm;codecs=vp9');
    recordingContext.resetRecordingSession();
    recordingContext.mediaRecorder = null;
    recordingContext.videoStream = null;
    recordingContext.sourceStream = null;
    recordingContext.recordedChunks = [];
  });
}

function runMimeTypeSelectionSuite() {
  it('prefers compatibility recorder mime types when the stream carries audio', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus']);
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();

    expect(lastMediaRecorderInstance?.config.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(getSupportedMimeTypeMock).not.toHaveBeenCalled();
  });

  it('prefers compatibility recorder mime types for derived canvas streams', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8', 'video/webm;codecs=vp9']);
    recordingContext.sourceStream = createVideoStream();
    recordingContext.videoStream = createVideoStream();
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();

    expect(lastMediaRecorderInstance?.config.mimeType).toBe('video/webm;codecs=vp8');
    expect(getSupportedMimeTypeMock).not.toHaveBeenCalled();
  });
}

function runAudioFallbackMimeTypeSelectionSuite() {
  it('prefers plain webm for streams with mixed audio', () => {
    installMediaRecorderMock(['video/webm', 'video/webm;codecs=vp8,opus']);
    getSupportedMimeTypeMock.mockReturnValue('video/webm');
    recordingContext.audioMixer = {} as never;
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorder();

    expect(lastMediaRecorderInstance?.config.mimeType).toBe('video/webm');
    expect(lastMediaRecorderInstance?.config).not.toHaveProperty('audioBitsPerSecond');
  });

  it('falls back to the canonical recorder mime order when audio is present', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8,opus']);
    getSupportedMimeTypeMock.mockReturnValue('video/webm;codecs=vp8,opus');
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-2');

    bootstrapRecorder();

    expect(lastMediaRecorderInstance?.config.mimeType).toBe('video/webm;codecs=vp8,opus');
    expect(getSupportedMimeTypeMock).toHaveBeenCalledOnce();
  });
}

function runCursorModeMessageSuite() {
  it('includes the verified cursor capture mode in the runtime start event when provided', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorderWithCursorMode('embedded-fallback');

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          type: 'OFFSCREEN_RECORDING_STARTED',
          recordingId: 'recording-1',
          cursorCaptureMode: 'embedded-fallback',
        },
      })
    );
  });
}

function runDisplaySurfaceMessageSuite() {
  it('includes the validated display surface in the runtime start event when available', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorderWithSurface('window');

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          type: 'OFFSCREEN_RECORDING_STARTED',
          recordingId: 'recording-1',
          cursorCaptureMode: 'separate',
          displaySurface: 'window',
        },
      })
    );
  });

  it('omits unknown display-surface values from the runtime start event', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorderWithSurface(undefined);

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          type: 'OFFSCREEN_RECORDING_STARTED',
          recordingId: 'recording-1',
          cursorCaptureMode: 'separate',
        },
      })
    );
  });
}

function runCursorModeSurfaceFilterSuite() {
  it('filters unsupported display-surface values from the runtime start event', () => {
    installMediaRecorderMock(['video/webm;codecs=vp8']);
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    bootstrapRecorderWithSurface('tab');

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          type: 'OFFSCREEN_RECORDING_STARTED',
          recordingId: 'recording-1',
          cursorCaptureMode: 'separate',
        },
      })
    );
  });
}

describe('offscreen-recording-start-recorder', () => {
  registerRecorderTestSetup();
  runMimeTypeSelectionSuite();
  runAudioFallbackMimeTypeSelectionSuite();
  runCursorModeMessageSuite();
  runDisplaySurfaceMessageSuite();
  runCursorModeSurfaceFilterSuite();
});
