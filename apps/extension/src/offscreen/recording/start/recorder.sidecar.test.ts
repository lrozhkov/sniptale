import { beforeEach, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  finalizeActiveSidecarRecordingsMock,
  finalizeRecordingMock,
  hasActiveSidecarSessionMock,
  notifyRecordingStoppedBestEffortMock,
  notifyVideoSavedToIdbBestEffortMock,
  stopActiveSidecarRecordersWithFlushMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  finalizeActiveSidecarRecordingsMock: vi.fn(),
  finalizeRecordingMock: vi.fn(),
  hasActiveSidecarSessionMock: vi.fn(),
  notifyRecordingStoppedBestEffortMock: vi.fn(),
  notifyVideoSavedToIdbBestEffortMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
}));

vi.mock('../stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stream')>();
  return {
    ...actual,
    getSupportedMimeType: vi.fn(() => 'video/webm'),
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
    startActiveSidecarRecorders: vi.fn(),
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
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { finalizeRecordingBootstrap } from './recorder';

type MediaRecorderMockInstance = {
  onstop: (() => Promise<void>) | null;
};

let lastMediaRecorderInstance: MediaRecorderMockInstance | null = null;

function installMediaRecorderMock() {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn(() => true);

    ondataavailable = null;
    onerror = null;
    onstop = null;
    start = vi.fn();

    constructor() {
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

function createAudioBearingVideoStream() {
  return {
    getAudioTracks: () => [{}],
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  installMediaRecorderMock();
  finalizeRecordingMock.mockResolvedValue(null);
  finalizeActiveSidecarRecordingsMock.mockResolvedValue(undefined);
  hasActiveSidecarSessionMock.mockReturnValue(true);
  stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
  recordingContext.resetRecordingSession();
  recordingContext.videoStream = createVideoStream();
  recordingContext.sourceStream = recordingContext.videoStream;
  recordingContext.beginRecordingSession('recording-1');
});

it('does not send a saved notification when sidecar-aware main finalization is discarded', async () => {
  recordingContext.discardOnStop = true;
  recordingContext.stopRecordingResolve = vi.fn();

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
  await lastMediaRecorderInstance?.onstop?.();

  expect(finalizeRecordingMock).toHaveBeenCalledWith([], 'recording-1', undefined, true, {
    notifySaved: false,
    notifyStopped: false,
  });
  expect(finalizeActiveSidecarRecordingsMock).toHaveBeenCalledWith(true);
  expect(notifyVideoSavedToIdbBestEffortMock).not.toHaveBeenCalled();
  expect(notifyRecordingStoppedBestEffortMock).toHaveBeenCalledWith(
    'recording-finalized-with-sidecars',
    'recording-1'
  );
});

it('starts audio-bearing main streams while sidecar recording is active', () => {
  recordingContext.videoStream = createAudioBearingVideoStream();
  recordingContext.sourceStream = recordingContext.videoStream;

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

  expect(lastMediaRecorderInstance).not.toBeNull();
});
