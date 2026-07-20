import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettings, createVideoStream } from './helpers.test-support';

const {
  finalizeRecordingMock,
  getSupportedMimeTypeMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  finalizeRecordingMock: vi.fn(),
  getSupportedMimeTypeMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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
      debug: loggerDebugMock,
      error: loggerErrorMock,
      info: loggerInfoMock,
      warn: loggerWarnMock,
    }),
  };
});

vi.mock('../stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stream')>();
  return {
    ...actual,
    getSupportedMimeType: getSupportedMimeTypeMock,
  };
});

import { finalizeRecordingBootstrap, handleRecordingStartError } from './helpers';
import { recordingContext } from '../context';
import { createDurationTracker } from '../duration';

class MediaRecorderMock {
  static isTypeSupported = vi.fn(() => false);

  ondataavailable: ((event: { data?: Blob | null }) => void) | null = null;
  onstop: (() => Promise<void>) | null = null;
  start = vi.fn();
  stop = vi.fn();
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;

  constructor(
    _stream: MediaStream,
    readonly _config: { audioBitsPerSecond?: number; mimeType: string; videoBitsPerSecond: number }
  ) {
    this.mimeType = _config.mimeType;
  }
}

function resetRecordingBootstrapContext() {
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = createVideoStream();
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.recordedChunks = [];
}

async function verifyNotificationFailureTrace() {
  const durationTracker = createDurationTracker(vi.fn());

  sendRuntimeMessageMock
    .mockRejectedValueOnce(new Error('start notify failed'))
    .mockRejectedValueOnce(new Error('error notify failed'));

  recordingContext.beginRecordingSession('recording-3');
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-3',
    settings: createSettings(),
    captureWidth: 1280,
    captureHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker,
  });
  handleRecordingStartError(new Error('boom-again'));
  await Promise.resolve();
  await Promise.resolve();

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      logMessage: 'Failed to notify runtime that recording started',
      payload: {
        type: 'OFFSCREEN_RECORDING_STARTED',
        recordingId: 'recording-3',
      },
    })
  );
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      logMessage: 'Failed to notify runtime about recording start failure',
      payload: expect.objectContaining({
        type: 'OFFSCREEN_ERROR',
        error: 'boom-again',
        phase: 'start',
        recordingId: 'recording-3',
      }),
    })
  );
}

async function verifyRequestScopedStartErrorRecordingId() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  recordingContext.beginRecordingSession('recording-old');

  handleRecordingStartError(new Error('start failed'), 'recording-new');
  await Promise.resolve();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        type: 'OFFSCREEN_ERROR',
        error: 'start failed',
        phase: 'start',
        recordingId: 'recording-new',
      }),
    })
  );
}

async function verifyUnscopedStartErrorNotification() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);

  handleRecordingStartError('primitive start failure');
  await Promise.resolve();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: 'OFFSCREEN_ERROR',
        error: 'primitive start failure',
        phase: 'start',
      },
    })
  );
}

describe('offscreen-recording-start-helpers notification traces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, {
      MediaRecorder: MediaRecorderMock,
    });
    getSupportedMimeTypeMock.mockReturnValue('video/webm;codecs=vp9');
    sendRuntimeMessageMock.mockResolvedValue(undefined);
    resetRecordingBootstrapContext();
  });

  it(
    'logs runtime notification failures during recording bootstrap and startup error handling',
    verifyNotificationFailureTrace
  );
  it(
    'uses the accepted start request recording id for startup errors',
    verifyRequestScopedStartErrorRecordingId
  );
  it(
    'publishes unscoped startup errors without a stale recording id',
    verifyUnscopedStartErrorNotification
  );
});
