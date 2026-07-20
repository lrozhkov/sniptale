import { beforeEach, expect, it, vi } from 'vitest';

const {
  cleanupResourcesMock,
  durationTrackerMock,
  finalizeRecordingBootstrapMock,
  handleRecordingStartErrorMock,
  initializeRecordingSessionMock,
  prepareRecordingStreamMock,
  initializeSidecarRecordersMock,
  recordingContextMock,
} = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  durationTrackerMock: { publishDuration: vi.fn() },
  finalizeRecordingBootstrapMock: vi.fn(),
  handleRecordingStartErrorMock: vi.fn(),
  initializeRecordingSessionMock: vi.fn(() => 'recording-1'),
  prepareRecordingStreamMock: vi.fn(),
  initializeSidecarRecordersMock: vi.fn(),
  recordingContextMock: {
    currentRecordingId: 'recording-1' as string | null,
    durationTracker: { publishDuration: vi.fn() },
    lifecycleState: 'starting' as 'idle' | 'starting' | 'recording' | 'stopping',
  },
}));

vi.mock('../setup', () => ({
  prepareRecordingStream: prepareRecordingStreamMock,
}));

vi.mock('../context', () => ({
  recordingContext: recordingContextMock,
}));

vi.mock('../sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sidecar')>();
  return {
    ...actual,
    initializeSidecarRecorders: initializeSidecarRecordersMock,
  };
});

vi.mock('./helpers', () => ({
  cleanupResources: cleanupResourcesMock,
  finalizeRecordingBootstrap: finalizeRecordingBootstrapMock,
  handleRecordingStartError: handleRecordingStartErrorMock,
  initializeRecordingSession: initializeRecordingSessionMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createSettings } from './helpers.test-support';
import { cleanupResources, startRecording } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  recordingContextMock.currentRecordingId = 'recording-1';
  recordingContextMock.durationTracker = durationTrackerMock;
  recordingContextMock.lifecycleState = 'starting';
  initializeSidecarRecordersMock.mockResolvedValue(undefined);
});

it('re-exports cleanupResources from the local helper seam', () => {
  expect(cleanupResources).toBe(cleanupResourcesMock);
});

it('omits undefined optional params when delegating into prepareRecordingStream', async () => {
  const settings = createSettings();
  prepareRecordingStreamMock.mockResolvedValue({
    cursorCaptureMode: 'embedded-fallback',
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });

  await startRecording({
    captureMode: CaptureMode.SCREEN,
    settings,
    streamId: 'stream-1',
  });

  expect(prepareRecordingStreamMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.SCREEN,
    settings,
    streamId: 'stream-1',
  });
  expect(finalizeRecordingBootstrapMock).toHaveBeenCalledWith({
    captureHeight: undefined,
    captureWidth: undefined,
    cursorCaptureMode: 'embedded-fallback',
    durationTracker: durationTrackerMock,
    resolvedRecordingId: 'recording-1',
    settings,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  expect(initializeSidecarRecordersMock).toHaveBeenCalledWith({
    baseRecordingId: 'recording-1',
    captureMode: CaptureMode.SCREEN,
    settings,
  });
});

it('forwards provided optional viewport params into prepareRecordingStream', async () => {
  const settings = createSettings();
  prepareRecordingStreamMock.mockResolvedValue({
    captureHeight: 540,
    captureWidth: 960,
    cursorCaptureMode: 'separate',
    trackSettings: { frameRate: 30, height: 540, width: 960 },
  });

  await startRecording({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    emulatedViewportCssSize: { width: 480, height: 270 },
    settings,
    streamId: 'stream-2',
    targetResolution: { width: 960, height: 540 },
    viewport: { width: 480, height: 270, devicePixelRatio: 2 },
  });

  expect(prepareRecordingStreamMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    emulatedViewportCssSize: { width: 480, height: 270 },
    settings,
    streamId: 'stream-2',
    targetResolution: { width: 960, height: 540 },
    viewport: { width: 480, height: 270, devicePixelRatio: 2 },
  });
  expect(finalizeRecordingBootstrapMock).toHaveBeenCalledWith(
    expect.objectContaining({
      cursorCaptureMode: 'separate',
    })
  );
});

it('cleans up stale sessions and routes thrown errors through the local error normalizer', async () => {
  prepareRecordingStreamMock
    .mockResolvedValueOnce({
      captureHeight: 720,
      captureWidth: 1280,
      trackSettings: { frameRate: 30, height: 720, width: 1280 },
    })
    .mockRejectedValueOnce(new Error('setup failed'));
  handleRecordingStartErrorMock.mockImplementation((error: unknown) => error);
  recordingContextMock.currentRecordingId = null;
  recordingContextMock.lifecycleState = 'idle';
  const settings = createSettings();

  await startRecording({
    settings,
    streamId: 'stream-stale',
  });

  await expect(
    startRecording({
      settings,
      streamId: 'stream-error',
    })
  ).rejects.toThrow('setup failed');

  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(expect.any(Error), undefined);
});

it('routes webcam sidecar acquisition failures through the start error path', async () => {
  prepareRecordingStreamMock.mockResolvedValue({
    cursorCaptureMode: 'separate',
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  initializeSidecarRecordersMock.mockRejectedValueOnce(new Error('webcam denied'));
  handleRecordingStartErrorMock.mockImplementation((error: unknown) => error);
  const settings = Object.assign(createSettings(), { webcamEnabled: true });

  await expect(
    startRecording({
      settings,
      streamId: 'stream-webcam',
    })
  ).rejects.toThrow('webcam denied');

  expect(finalizeRecordingBootstrapMock).not.toHaveBeenCalled();
  expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(expect.any(Error), undefined);
});

it('routes start errors with the accepted request recording id', async () => {
  prepareRecordingStreamMock.mockRejectedValueOnce(new Error('setup failed'));
  handleRecordingStartErrorMock.mockImplementation((error: unknown) => error);
  const settings = createSettings();

  await expect(
    startRecording({
      recordingId: 'recording-new',
      settings,
      streamId: 'stream-error',
    })
  ).rejects.toThrow('setup failed');

  expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(expect.any(Error), 'recording-new');
});

it('times out stalled startup so the popup receives a start failure', async () => {
  vi.useFakeTimers();
  prepareRecordingStreamMock.mockReturnValueOnce(new Promise(() => undefined));
  handleRecordingStartErrorMock.mockImplementation((error: unknown) => error);

  try {
    const startPromise = startRecording({
      settings: createSettings(),
      streamId: 'stream-timeout',
    });
    const startExpectation = expect(startPromise).rejects.toThrow(
      'Timed out while starting offscreen recording'
    );

    await vi.runOnlyPendingTimersAsync();

    await startExpectation;
    expect(finalizeRecordingBootstrapMock).not.toHaveBeenCalled();
    expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(expect.any(Error), undefined);
  } finally {
    vi.useRealTimers();
  }
});
