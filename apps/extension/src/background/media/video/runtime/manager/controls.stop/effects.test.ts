import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  awaitBestEffortMock,
  appendControlledCursorTelemetryMock,
  disableControlledCursorCaptureMock,
  getControlledCursorDisplaySurfaceMock,
  getControlledCursorVerifiedModeMock,
  getControlledCursorTelemetryMock,
  getVideoRecordingIdMock,
  isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPendingMock,
  logger,
  runBestEffortMock,
  saveRecordingTelemetrySafelyMock,
  sendTabMessageMock,
  surfaceLeaseState,
  updateVideoRecordingSurfaceMock,
} = vi.hoisted(() => ({
  awaitBestEffortMock: vi.fn(),
  appendControlledCursorTelemetryMock: vi.fn(),
  disableControlledCursorCaptureMock: vi.fn(),
  getControlledCursorDisplaySurfaceMock: vi.fn(),
  getControlledCursorVerifiedModeMock: vi.fn(),
  getControlledCursorTelemetryMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  isControlledCursorCaptureEnabledMock: vi.fn(),
  isControlledCursorNavigationPendingMock: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  runBestEffortMock: vi.fn(),
  saveRecordingTelemetrySafelyMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  surfaceLeaseState: {
    current: null as null | { recordingId: string | null; surfaceSessionId: string; tabId: number },
  },
  updateVideoRecordingSurfaceMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => logger,
}));

vi.mock('@sniptale/foundation/best-effort', () => ({
  awaitBestEffort: awaitBestEffortMock,
  runBestEffort: runBestEffortMock,
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('../../../../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../workflows/media-hub/store')>()),
  saveRecordingTelemetrySafely: saveRecordingTelemetrySafelyMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  appendControlledCursorTelemetry: appendControlledCursorTelemetryMock,
  getControlledCursorDisplaySurface: getControlledCursorDisplaySurfaceMock,
  getControlledCursorVerifiedMode: getControlledCursorVerifiedModeMock,
  getControlledCursorTelemetry: getControlledCursorTelemetryMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  isControlledCursorCaptureEnabled: isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPending: isControlledCursorNavigationPendingMock,
}));

vi.mock('../controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controlled-cursor/messages')>()),
  disableControlledCursorCapture: disableControlledCursorCaptureMock,
}));
vi.mock('../../../content-surface/surface-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/surface-lease')>()),
  getVideoRecordingSurfaceLeaseSnapshot: () => surfaceLeaseState.current,
  updateVideoRecordingSurface: updateVideoRecordingSurfaceMock,
}));

import { runStopSideEffects } from './effects';

beforeEach(() => {
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  vi.clearAllMocks();
  surfaceLeaseState.current = null;
  updateVideoRecordingSurfaceMock.mockResolvedValue(undefined);
  sendTabMessageMock.mockResolvedValue(undefined);
  awaitBestEffortMock.mockImplementation((promise: Promise<unknown>) => promise);
  runBestEffortMock.mockImplementation((promise: Promise<unknown>) => promise);
  saveRecordingTelemetrySafelyMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue(null);
  getControlledCursorDisplaySurfaceMock.mockReturnValue(null);
  getControlledCursorVerifiedModeMock.mockReturnValue('embedded-fallback');
  getControlledCursorTelemetryMock.mockReturnValue(null);
  isControlledCursorCaptureEnabledMock.mockReturnValue(false);
  isControlledCursorNavigationPendingMock.mockReturnValue(false);
  disableControlledCursorCaptureMock.mockResolvedValue(null);
});

function flushStopSideEffects(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

function createControlledCursorTelemetry() {
  return {
    actionEvents: [],
    cursorTrack: {
      captureMode: 'separate' as const,
      samples: [{ id: 'sample-1', time: 0.2, visible: true, x: 10, y: 20 }],
      skin: { color: '#fff', hidden: false, scale: 1, shadow: true },
    },
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle' as const,
        point: null,
        startTime: 0,
      },
    ],
    viewport: {
      devicePixelRatio: 1,
      height: 720,
      scrollX: 0,
      scrollY: 100,
      width: 1280,
    },
  };
}

it('hides stop overlays and disables annotations when tab recording stops', async () => {
  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });
});

it('skips tab side effects when no tab is available', () => {
  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: null,
  });

  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('does not persist annotation telemetry when cursor telemetry capture is disabled', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  getVideoRecordingIdMock.mockReturnValue('recording-1');

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
});

it('persists merged controlled cursor telemetry when the dedicated cursor path is active', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getControlledCursorDisplaySurfaceMock.mockReturnValue('window');
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);
  surfaceLeaseState.current = {
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    tabId: 7,
  };
  const telemetry = createControlledCursorTelemetry();
  disableControlledCursorCaptureMock.mockResolvedValue(telemetry);
  getControlledCursorTelemetryMock.mockReturnValue(telemetry);

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(updateVideoRecordingSurfaceMock).toHaveBeenCalledWith('surface-1', {
    recordingId: null,
  });

  expect(appendControlledCursorTelemetryMock).toHaveBeenCalledWith(telemetry);
  expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith({
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 1234,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      samples: [{ id: 'sample-1', time: 0.2, visible: true, x: 10, y: 20 }],
      skin: { color: '#fff', hidden: true, scale: 1, shadow: true },
    },
    displaySurface: 'window',
    recordingId: 'recording-1',
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle',
        point: null,
        startTime: 0,
      },
    ],
    updatedAt: 1234,
    viewport: {
      devicePixelRatio: 1,
      height: 720,
      scrollX: 0,
      scrollY: 100,
      width: 1280,
    },
  });
});

it('does not persist telemetry when recording metadata is unavailable', async () => {
  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
});
