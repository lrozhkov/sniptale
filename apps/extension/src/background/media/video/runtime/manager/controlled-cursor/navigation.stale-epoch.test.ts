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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function simulateControlledCursorReset() {
  controlledCursorState.pending = false;
}

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
  isControlledCursorAutoPausedMock.mockReturnValue(true);
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);
  isControlledCursorNavigationPendingMock.mockImplementation(() => controlledCursorState.pending);
  getControlledCursorOffsetSecondsMock.mockReturnValue(4.25);
  disableControlledCursorCaptureMock.mockResolvedValue({
    actionEvents: [],
    cursorTrack: null,
    viewport: null,
  });
  enableControlledCursorCaptureMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  syncControlledCursorCaptureMock.mockResolvedValue(undefined);
});

it('starts a new epoch for each navigation start while a previous pause is pending', async () => {
  const firstFlush = createDeferred<null>();
  disableControlledCursorCaptureMock.mockReturnValueOnce(firstFlush.promise);

  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await vi.runAllTimersAsync();
  firstFlush.resolve(null);
  await vi.runAllTimersAsync();

  expect(beginControlledCursorNavigationMock).toHaveBeenCalledTimes(2);
  expect(disableControlledCursorCaptureMock).toHaveBeenCalledTimes(2);
  expect(appendControlledCursorTelemetryMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
});

it('ignores stale pause work after reset and new same-tab navigation', async () => {
  const firstFlush = createDeferred<null>();
  disableControlledCursorCaptureMock.mockReturnValueOnce(firstFlush.promise);

  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  simulateControlledCursorReset();
  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await vi.runAllTimersAsync();
  firstFlush.resolve(null);
  await vi.runAllTimersAsync();

  expect(beginControlledCursorNavigationMock).toHaveBeenCalledTimes(2);
  expect(appendControlledCursorTelemetryMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
});

it('preserves existing auto-pause authority across a newer navigation start', async () => {
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 4.25,
    error: 'background.runtime.controlledCursorCaptureNavigationPaused',
    status: VideoRecordingStatus.PAUSED,
    viewportPreset: null,
  });

  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await vi.runAllTimersAsync();

  expect(setControlledCursorAutoPausedMock).toHaveBeenCalledWith(true);
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('ignores a stale successful re-bootstrap after a newer navigation starts', async () => {
  controlledCursorState.pending = true;
  controlledCursorState.epoch = 1;
  const bootstrap = createDeferred<void>();
  enableControlledCursorCaptureMock.mockReturnValueOnce(bootstrap.promise);

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await Promise.resolve();
  controlledCursorState.epoch = 2;
  controlledCursorState.pending = true;
  bootstrap.resolve();
  await vi.runAllTimersAsync();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({ error: null });
  expect(setControlledCursorAutoPausedMock).not.toHaveBeenCalledWith(false);
  expect(clearControlledCursorNavigationPendingMock).not.toHaveBeenCalled();
});

it('ignores stale re-bootstrap work after reset and new same-tab navigation', async () => {
  controlledCursorState.pending = true;
  controlledCursorState.epoch = 1;
  const bootstrap = createDeferred<void>();
  enableControlledCursorCaptureMock.mockReturnValueOnce(bootstrap.promise);

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await Promise.resolve();
  simulateControlledCursorReset();
  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await vi.runAllTimersAsync();
  bootstrap.resolve();
  await vi.runAllTimersAsync();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({ error: null });
  expect(clearControlledCursorNavigationPendingMock).not.toHaveBeenCalled();
});

it('does not write re-bootstrap failure over a newer navigation epoch', async () => {
  controlledCursorState.pending = true;
  controlledCursorState.epoch = 1;
  enableControlledCursorCaptureMock.mockRejectedValue(new Error('not ready'));

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  controlledCursorState.epoch = 2;
  controlledCursorState.pending = true;
  await vi.runAllTimersAsync();

  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({
    error: 'background.runtime.controlledCursorCaptureNavigationRebootstrapFailed',
    status: VideoRecordingStatus.PAUSED,
  });
  expect(clearControlledCursorNavigationPendingMock).not.toHaveBeenCalled();
});
