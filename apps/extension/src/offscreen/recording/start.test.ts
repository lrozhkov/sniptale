import { expect, it, vi } from 'vitest';

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

vi.mock('./context', () => ({
  recordingContext: recordingContextMock,
}));

vi.mock('./setup', () => ({
  prepareRecordingStream: prepareRecordingStreamMock,
}));

vi.mock('./sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sidecar')>();
  return {
    ...actual,
    initializeSidecarRecorders: initializeSidecarRecordersMock,
  };
});

vi.mock('./start/helpers', () => ({
  cleanupResources: cleanupResourcesMock,
  finalizeRecordingBootstrap: finalizeRecordingBootstrapMock,
  handleRecordingStartError: handleRecordingStartErrorMock,
  initializeRecordingSession: initializeRecordingSessionMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from './start/index';
import { createSettings } from './start/helpers.test-support';

type StartRecordingParams = Parameters<typeof startRecording>[0];

function createStartParams(overrides: Partial<StartRecordingParams> = {}): StartRecordingParams {
  return {
    streamId: 'stream-1',
    settings: createSettings(),
    ...overrides,
  };
}

function resetStartRecordingMocks() {
  vi.clearAllMocks();
  recordingContextMock.currentRecordingId = 'recording-1';
  recordingContextMock.durationTracker = durationTrackerMock;
  recordingContextMock.lifecycleState = 'starting';
  initializeSidecarRecordersMock.mockResolvedValue(undefined);
}

it('skips bootstrap when the recording session is reset before stream setup completes', async () => {
  resetStartRecordingMocks();
  prepareRecordingStreamMock.mockResolvedValue({
    captureWidth: 1280,
    captureHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
  });
  recordingContextMock.currentRecordingId = null;
  recordingContextMock.lifecycleState = 'idle';

  await startRecording({
    streamId: 'stream-stale',
    settings: createSettings(),
  });

  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(finalizeRecordingBootstrapMock).not.toHaveBeenCalled();
  expect(handleRecordingStartErrorMock).not.toHaveBeenCalled();
});

it('passes recording stream params directly into prepareRecordingStream and bootstrap', async () => {
  resetStartRecordingMocks();
  const params = createStartParams({
    streamId: 'stream-1',
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { x: 10, y: 20, width: 300, height: 200 },
    targetResolution: { width: 1280, height: 720 },
    emulatedViewportCssSize: { width: 720, height: 450 },
  });

  prepareRecordingStreamMock.mockResolvedValue({
    captureWidth: 1280,
    captureHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
  });

  await startRecording(params);

  expect(initializeRecordingSessionMock).toHaveBeenCalledWith(params);
  expect(prepareRecordingStreamMock).toHaveBeenCalledWith({
    streamId: 'stream-1',
    settings: params.settings,
    viewport: params.viewport,
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: params.cropRegion,
    targetResolution: params.targetResolution,
    emulatedViewportCssSize: params.emulatedViewportCssSize,
  });
  expect(finalizeRecordingBootstrapMock).toHaveBeenCalledWith({
    resolvedRecordingId: 'recording-1',
    settings: params.settings,
    captureWidth: 1280,
    captureHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
    durationTracker: durationTrackerMock,
  });
  expect(initializeSidecarRecordersMock).toHaveBeenCalledWith({
    baseRecordingId: 'recording-1',
    captureMode: CaptureMode.TAB_CROP,
    settings: params.settings,
  });
  expect(handleRecordingStartErrorMock).not.toHaveBeenCalled();
});

it('rethrows startup errors after owner-local cleanup runs', async () => {
  resetStartRecordingMocks();
  const startupError = new Error('stream failed');
  prepareRecordingStreamMock.mockRejectedValueOnce(startupError);
  handleRecordingStartErrorMock.mockImplementationOnce((error: unknown) => error);

  await expect(
    startRecording({
      streamId: 'stream-error',
      settings: createSettings(),
    })
  ).rejects.toThrow('stream failed');

  expect(handleRecordingStartErrorMock).toHaveBeenCalledWith(startupError, undefined);
});
