import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  appendControlledCursorTelemetryMock,
  beginControlledCursorNavigationMock,
  clearControlledCursorNavigationPendingMock,
  controlledCursorState,
  disableControlledCursorCaptureMock,
  enableControlledCursorCaptureMock,
  getControlledCursorNavigationEpochMock,
  getControlledCursorOffsetSecondsMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  isControlledCursorAutoPausedMock,
  isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPendingMock,
  sendRuntimeMessageMock,
  setControlledCursorAutoPausedMock,
  setControlledCursorOffsetSecondsMock,
  setVideoRecordingRuntimeStateMock,
  syncControlledCursorCaptureMock,
} = vi.hoisted(() => ({
  appendControlledCursorTelemetryMock: vi.fn(),
  beginControlledCursorNavigationMock: vi.fn(),
  clearControlledCursorNavigationPendingMock: vi.fn(),
  controlledCursorState: { epoch: 0, pending: false },
  disableControlledCursorCaptureMock: vi.fn(),
  enableControlledCursorCaptureMock: vi.fn(),
  getControlledCursorNavigationEpochMock: vi.fn(),
  getControlledCursorOffsetSecondsMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  isControlledCursorAutoPausedMock: vi.fn(),
  isControlledCursorCaptureEnabledMock: vi.fn(),
  isControlledCursorNavigationPendingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setControlledCursorAutoPausedMock: vi.fn(),
  setControlledCursorOffsetSecondsMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  syncControlledCursorCaptureMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  appendControlledCursorTelemetry: appendControlledCursorTelemetryMock,
  beginControlledCursorNavigation: beginControlledCursorNavigationMock,
  clearControlledCursorNavigationPending: clearControlledCursorNavigationPendingMock,
  getControlledCursorNavigationEpoch: getControlledCursorNavigationEpochMock,
  getControlledCursorOffsetSeconds: getControlledCursorOffsetSecondsMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  isControlledCursorAutoPaused: isControlledCursorAutoPausedMock,
  isControlledCursorCaptureEnabled: isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPending: isControlledCursorNavigationPendingMock,
  setControlledCursorAutoPaused: setControlledCursorAutoPausedMock,
  setControlledCursorOffsetSeconds: setControlledCursorOffsetSecondsMock,
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('./messages', () => ({
  disableControlledCursorCapture: disableControlledCursorCaptureMock,
  enableControlledCursorCapture: enableControlledCursorCaptureMock,
  syncControlledCursorCapture: syncControlledCursorCaptureMock,
}));

import {
  handleControlledCursorNavigationStart,
  handleControlledCursorTabUpdate,
} from './navigation';

beforeEach(() => {
  vi.clearAllMocks();
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  vi.useFakeTimers();
  controlledCursorState.epoch = 0;
  controlledCursorState.pending = false;
  beginControlledCursorNavigationMock.mockImplementation(() => {
    controlledCursorState.epoch += 1;
    controlledCursorState.pending = true;
    return controlledCursorState.epoch;
  });
  clearControlledCursorNavigationPendingMock.mockImplementation((navigationEpoch: number) => {
    if (controlledCursorState.epoch !== navigationEpoch) {
      return false;
    }
    controlledCursorState.pending = false;
    return true;
  });
  getControlledCursorNavigationEpochMock.mockImplementation(() => controlledCursorState.epoch);
  getVideoRecordingTabIdMock.mockReturnValue(7);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 4.25,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPreset: null,
  });
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);
  isControlledCursorNavigationPendingMock.mockImplementation(() => controlledCursorState.pending);
  isControlledCursorAutoPausedMock.mockReturnValue(true);
  getControlledCursorOffsetSecondsMock.mockReturnValue(4.25);
  disableControlledCursorCaptureMock.mockResolvedValue({
    actionEvents: [],
    cursorTrack: null,
    viewport: null,
  });
  enableControlledCursorCaptureMock.mockResolvedValue(undefined);
  syncControlledCursorCaptureMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('auto-pauses recording and flushes telemetry before same-tab navigation unloads content', async () => {
  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await vi.runAllTimersAsync();

  expect(beginControlledCursorNavigationMock).toHaveBeenCalledOnce();
  expect(setControlledCursorAutoPausedMock).toHaveBeenCalledWith(true);
  expect(setControlledCursorOffsetSecondsMock).toHaveBeenCalledWith(4.25);
  expect(disableControlledCursorCaptureMock).toHaveBeenCalledWith(7);
  expect(appendControlledCursorTelemetryMock).toHaveBeenCalledWith({
    actionEvents: [],
    cursorTrack: null,
    viewport: null,
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
      capabilityToken: expect.any(String),
    })
  );
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    error: 'background.runtime.controlledCursorCaptureNavigationPaused',
    status: VideoRecordingStatus.PAUSED,
  });
});

it('keeps tab loading as a fallback without double flushing after onBeforeNavigate', async () => {
  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  expect(handleControlledCursorTabUpdate(7, 'loading')).toBe(true);
  await vi.runAllTimersAsync();

  expect(disableControlledCursorCaptureMock).toHaveBeenCalledTimes(1);
  expect(beginControlledCursorNavigationMock).toHaveBeenCalledOnce();
});

it('ignores navigation starts outside the controlled cursor recording tab', () => {
  expect(handleControlledCursorNavigationStart(8)).toBe(false);

  expect(disableControlledCursorCaptureMock).not.toHaveBeenCalled();
  expect(beginControlledCursorNavigationMock).not.toHaveBeenCalled();
});

it('does not re-bootstrap when completion arrives without a pending navigation', () => {
  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(false);

  expect(enableControlledCursorCaptureMock).not.toHaveBeenCalled();
});

it('re-bootstrap controlled cursor capture after a completed navigation and resumes offscreen recording', async () => {
  controlledCursorState.pending = true;
  controlledCursorState.epoch = 1;

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await vi.runAllTimersAsync();

  expect(enableControlledCursorCaptureMock).toHaveBeenCalledWith(7, 'recording-1', 4.25);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
      capabilityToken: expect.any(String),
    })
  );
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({ error: null });
  expect(setControlledCursorAutoPausedMock).toHaveBeenCalledWith(false);
  expect(clearControlledCursorNavigationPendingMock).toHaveBeenCalledWith(1);
});

it('keeps recording paused when re-bootstrap fails across all retries', async () => {
  controlledCursorState.pending = true;
  controlledCursorState.epoch = 1;
  enableControlledCursorCaptureMock.mockRejectedValue(new Error('not ready'));

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await vi.runAllTimersAsync();

  expect(enableControlledCursorCaptureMock).toHaveBeenCalledTimes(3);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    error: 'background.runtime.controlledCursorCaptureNavigationRebootstrapFailed',
    status: VideoRecordingStatus.PAUSED,
  });
});
