import { beforeEach, describe, expect, it, vi } from 'vitest';

// State-machine proof: terminal recorder lifecycle emits start/failure/cancel events through owners.
const {
  createLiveRecordingArtifactSessionMock,
  loggerDebugMock,
  loggerInfoMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  createLiveRecordingArtifactSessionMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../encoding/live-artifact-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../encoding/live-artifact-session')>()),
  createLiveRecordingArtifactSession: createLiveRecordingArtifactSessionMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    error: vi.fn(),
    info: loggerInfoMock,
    warn: vi.fn(),
  }),
}));

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoFrameRate,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

function createVideoStream(audioTrackCount = 0) {
  return {
    getAudioTracks: () =>
      Array.from({ length: audioTrackCount }, () => ({ kind: 'audio' as const })),
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

function createDurationTrackerDouble(): typeof recordingContext.durationTracker {
  return {
    freeze: vi.fn(),
    getElapsedSeconds: vi.fn(() => 0),
    publishDuration: vi.fn(),
    reset: vi.fn(),
    startSegment: vi.fn(),
    stopSegment: vi.fn(),
  };
}

function bootstrapRecorder() {
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  return finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: {
      outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
    } as never,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

function bootstrapRecorderWithCursorMode(cursorCaptureMode: 'separate' | 'embedded-fallback') {
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  return finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: {
      outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
    } as never,
    cursorCaptureMode,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: {
      reset: vi.fn(),
      startSegment: vi.fn(),
    } as never,
  });
}

function bootstrapRecorderWithSurface(displaySurface: string | undefined) {
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  return finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-1',
    settings: {
      outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
    } as never,
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
    recordingContext.resetRecordingSession();
    recordingContext.videoStream = null;
    recordingContext.sourceStream = null;
    createLiveRecordingArtifactSessionMock.mockImplementation(async () => {
      let callbacks: { onStart?(): void } = {};
      return {
        abort: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        setLifecycleCallbacks: vi.fn((next) => {
          callbacks = next;
        }),
        start: vi.fn(() => callbacks.onStart?.()),
        state: 'recording',
        stop: vi.fn(),
      };
    });
  });
}

function runMimeTypeSelectionSuite() {
  it('prefers compatibility recorder mime types when the stream carries audio', async () => {
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorder();

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: expect.objectContaining({ audioCodec: 'opus', videoCodec: 'vp9' }),
        mimeType: 'video/webm',
      })
    );
  });

  it('keeps the selected codec for derived canvas streams', async () => {
    recordingContext.sourceStream = createVideoStream();
    recordingContext.videoStream = createVideoStream();
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorder();

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: expect.objectContaining({ videoCodec: 'vp9' }),
        mimeType: 'video/webm',
      })
    );
  });

  it('passes the encoder-adjacent frame transform to the live artifact owner', async () => {
    recordingContext.sourceStream = createVideoStream();
    recordingContext.videoStream = createVideoStream();
    recordingContext.beginRecordingSession('recording-1');
    recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
    const encoderFrameTransform = {
      fit: 'fill' as const,
      outputSize: { height: 720, width: 1280 },
      sourceRect: { height: 720, width: 1280, x: 0, y: 0 },
    };

    await finalizeRecordingBootstrap({
      encoderFrameTransform,
      resolvedRecordingId: 'recording-1',
      settings: { ...DEFAULT_VIDEO_SETTINGS, outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE },
      trackSettings: { width: 1280, height: 720, frameRate: 30 },
      durationTracker: createDurationTrackerDouble(),
    });

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ frameTransform: encoderFrameTransform })
    );
  });
}

function runAudioFallbackMimeTypeSelectionSuite() {
  it('keeps the selected codec for streams with mixed audio', async () => {
    recordingContext.audioMixer = {} as never;
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorder();

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ encoding: expect.objectContaining({ audioCodec: 'opus' }) })
    );
  });

  it('rejects another codec instead of silently falling back when audio is present', async () => {
    createLiveRecordingArtifactSessionMock.mockRejectedValueOnce(
      new Error('The selected live video encoder configuration is not supported.')
    );
    recordingContext.videoStream = createVideoStream(1);
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-2');

    await expect(bootstrapRecorder()).rejects.toThrow(
      'selected live video encoder configuration is not supported'
    );
  });
}

function runAvcLevelSelectionSuite() {
  it('uses the selected quality bitrate without a TAB-only multiplier', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-browser');
    recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());

    await finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-browser',
      settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        outputProfile: {
          codec: VideoOutputCodec.AVC,
          container: VideoOutputContainer.MP4,
          frameRate: VideoFrameRate.FPS60,
          quality: VideoQuality.HIGH,
          resolution: VideoResolutionPreset.SOURCE,
        },
      },
      trackSettings: {
        width: 2560,
        height: 1304,
        frameRate: VideoFrameRate.FPS60,
      },
      durationTracker: createDurationTrackerDouble(),
    });

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: expect.objectContaining({
          frameRate: VideoFrameRate.FPS60,
          videoBitrate: 24_000_000,
          videoCodec: 'avc',
        }),
      })
    );
  });

  it('selects AVC High Level 5.1 for 2560x1304 at 60 FPS', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');
    recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());

    await finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-1',
      settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        outputProfile: {
          codec: VideoOutputCodec.AVC,
          container: VideoOutputContainer.MP4,
          frameRate: 60,
          quality: VideoQuality.ULTRA,
          resolution: VideoResolutionPreset.P1440,
        },
      },
      trackSettings: { width: 2560, height: 1304, frameRate: 60 },
      durationTracker: createDurationTrackerDouble(),
    });

    expect(createLiveRecordingArtifactSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: expect.objectContaining({
          frameRate: 60,
          videoBitrate: 36_000_000,
          videoCodec: 'avc',
          videoCodecString: 'avc1.640033',
        }),
        mimeType: 'video/mp4',
      })
    );
  });
}

function runCursorModeMessageSuite() {
  it('includes the verified cursor capture mode in the runtime start event when provided', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorderWithCursorMode('embedded-fallback');

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
  it('includes the validated display surface in the runtime start event when available', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorderWithSurface('window');

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

  it('omits unknown display-surface values from the runtime start event', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorderWithSurface(undefined);

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
  it('filters unsupported display-surface values from the runtime start event', async () => {
    recordingContext.videoStream = createVideoStream();
    recordingContext.sourceStream = recordingContext.videoStream;
    recordingContext.beginRecordingSession('recording-1');

    await bootstrapRecorderWithSurface('tab');

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
  runAvcLevelSelectionSuite();
  runCursorModeMessageSuite();
  runDisplaySurfaceMessageSuite();
  runCursorModeSurfaceFilterSuite();
});
