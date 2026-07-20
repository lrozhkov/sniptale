import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  awaitBestEffortMock,
  appendControlledCursorTelemetryMock,
  clearViewportMock,
  detachDebuggerMock,
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
} = vi.hoisted(() => ({
  awaitBestEffortMock: vi.fn(),
  appendControlledCursorTelemetryMock: vi.fn(),
  clearViewportMock: vi.fn(),
  detachDebuggerMock: vi.fn(),
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

vi.mock('../../../../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
}));

vi.mock('../../../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../debugger/workspace')>()),
  clearViewport: clearViewportMock,
}));

vi.mock('../controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controlled-cursor/messages')>()),
  disableControlledCursorCapture: disableControlledCursorCaptureMock,
}));

import { runStopSideEffects } from './effects';

beforeEach(() => {
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  vi.clearAllMocks();
  sendTabMessageMock.mockResolvedValue(undefined);
  clearViewportMock.mockResolvedValue(undefined);
  detachDebuggerMock.mockResolvedValue(undefined);
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

function mockTelemetryDisableMessage() {
  sendTabMessageMock.mockImplementation((_tabId: number, message: { type: string }) => {
    if (message.type === VideoMessageType.DISABLE_ANNOTATIONS) {
      return Promise.resolve({
        success: true,
        telemetry: {
          actionEvents: [],
          viewport: {
            devicePixelRatio: 1,
            height: 720,
            scrollX: 0,
            scrollY: 100,
            width: 1280,
          },
          cursorTrack: {
            captureMode: 'separate',
            samples: [{ id: 'sample-1', time: 0.2, visible: true, x: 10, y: 20 }],
            skin: { color: '#fff', hidden: false, scale: 1, shadow: true },
          },
          signals: [],
        },
      });
    }

    return Promise.resolve(undefined);
  });
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

it('hides stop overlays and clears viewport before detach when viewport emulation stops', async () => {
  runStopSideEffects({
    mode: CaptureMode.VIEWPORT_EMULATION,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.DISABLE_ANNOTATIONS,
  });
  expect(clearViewportMock).toHaveBeenCalledWith(7);
  expect(detachDebuggerMock).toHaveBeenCalledWith(7, 'video-emulation');
  expect(clearViewportMock.mock.invocationCallOrder[0]!).toBeLessThan(
    detachDebuggerMock.mock.invocationCallOrder[0]!
  );
});

it('skips side effects when no tab is available and when the mode is not viewport emulation', () => {
  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: null,
  });

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(detachDebuggerMock).not.toHaveBeenCalled();
});

it('does not persist annotation telemetry when cursor telemetry capture is disabled', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  mockTelemetryDisableMessage();

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.DISABLE_ANNOTATIONS,
  });
  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
});

it('persists merged controlled cursor telemetry when the dedicated cursor path is active', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getControlledCursorDisplaySurfaceMock.mockReturnValue('window');
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);
  const telemetry = createControlledCursorTelemetry();
  disableControlledCursorCaptureMock.mockResolvedValue(telemetry);
  getControlledCursorTelemetryMock.mockReturnValue(telemetry);

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

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
  sendTabMessageMock.mockImplementation((_tabId: number, message: { type: string }) => {
    if (message.type === VideoMessageType.DISABLE_ANNOTATIONS) {
      return Promise.resolve({
        success: true,
        telemetry: { actionEvents: [], cursorTrack: null, signals: [], viewport: null },
      });
    }

    return Promise.resolve(undefined);
  });

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
});
