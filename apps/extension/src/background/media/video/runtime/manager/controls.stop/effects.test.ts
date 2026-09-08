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

import { runStopSideEffects, waitForStopSideEffects } from './effects';

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
  return waitForStopSideEffects();
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
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.HIDE_RECORDING_OVERLAY,
  });
});

it('skips tab side effects when no tab is available', () => {
  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: null,
  });

  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('persists action history for a plain tab with controlled cursor disabled', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  const telemetry = createControlledCursorTelemetry();
  disableControlledCursorCaptureMock.mockResolvedValue(telemetry);
  getControlledCursorTelemetryMock.mockReturnValue(null);

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(disableControlledCursorCaptureMock).toHaveBeenCalledWith(7);
  expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1', actionEvents: telemetry.actionEvents })
  );
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
  getControlledCursorTelemetryMock.mockReturnValue(null);

  runStopSideEffects({
    mode: CaptureMode.TAB,
    tabId: 7,
  });

  await flushStopSideEffects();

  expect(updateVideoRecordingSurfaceMock).toHaveBeenCalledWith('surface-1', {
    recordingId: null,
  });

  expect(appendControlledCursorTelemetryMock).not.toHaveBeenCalled();
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

it('waits for independent geometry and content results while preserving the stopped recording identity', async () => {
  const viewport = {
    width: 1280,
    height: 720,
    devicePixelRatio: 1,
    visualViewportScale: 1,
    visualViewportOffsetX: 0,
    visualViewportOffsetY: 0,
  };
  const telemetry = {
    ...createControlledCursorTelemetry(),
    viewportObservation: { initial: viewport, stable: true },
    actionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        label: 'Click',
        time: 1,
        duration: 0.45,
        preset: 'CLICK_RIPPLE',
        point: { x: 320, y: 540 },
        data: {},
      },
    ],
  };
  let finishContent: (value: typeof telemetry) => void = () => undefined;
  disableControlledCursorCaptureMock.mockReturnValue(
    new Promise<typeof telemetry>((resolve) => {
      finishContent = resolve;
    })
  );
  getVideoRecordingIdMock.mockReturnValue('stopped-recording');
  const geometry = {
    viewport,
    visibleClientRect: { x: 0, y: 0, width: 1280, height: 720 },
    scaleX: 1 / 1280,
    scaleY: 1 / 720,
    offsetX: 0,
    offsetY: 0,
  };
  const collected = runStopSideEffects({ mode: CaptureMode.TAB, tabId: 7 }, 'detailed', {
    recordingPointTransform: Promise.resolve(geometry),
  });
  await Promise.resolve();
  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
  getVideoRecordingIdMock.mockReturnValue('later-recording');
  getControlledCursorTelemetryMock.mockReturnValue({ ...telemetry, actionEvents: [] });
  finishContent(telemetry);
  await collected;
  await waitForStopSideEffects();
  expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledOnce();
  expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingId: 'stopped-recording',
      actionEvents: [
        expect.objectContaining({
          id: 'click',
          point: { x: 320, y: 540 },
          recordingPoint: { x: 0.25, y: 0.75 },
        }),
      ],
    })
  );
  expect(telemetry.actionEvents[0]).not.toHaveProperty('recordingPoint');
});

it.each([true, false])(
  'retains facts with missing geometry unless discarded=%s',
  async (discard) => {
    getVideoRecordingIdMock.mockReturnValue('recording');
    const telemetry = {
      ...createControlledCursorTelemetry(),
      actionEvents: [
        {
          id: 'click',
          kind: 'CLICK',
          label: 'Click',
          time: 1,
          duration: 0.45,
          preset: 'CLICK_RIPPLE',
          point: { x: 320, y: 540 },
          data: {},
        },
      ],
    };
    disableControlledCursorCaptureMock.mockResolvedValue(telemetry);
    await runStopSideEffects({ mode: CaptureMode.TAB, tabId: 7 }, 'detailed', {
      discard,
      recordingPointTransform: Promise.resolve(null),
    });
    await waitForStopSideEffects();
    if (discard) expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
    else
      expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionEvents: [
            expect.objectContaining({
              id: 'click',
              point: { x: 320, y: 540 },
              recordingPoint: null,
            }),
          ],
        })
      );
  }
);
