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
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function makeNavigationStale() {
  controlledCursorState.epoch += 1;
  controlledCursorState.pending = true;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
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
  disableControlledCursorCaptureMock.mockResolvedValue(null);
  enableControlledCursorCaptureMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  syncControlledCursorCaptureMock.mockResolvedValue(undefined);
});

it('does not write paused state after a stale pause command settles', async () => {
  const pause = createDeferred<void>();
  sendRuntimeMessageMock.mockReturnValueOnce(pause.promise);

  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await flushMicrotasks();
  makeNavigationStale();
  pause.resolve();
  await flushMicrotasks();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING })
  );
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({
    error: 'background.runtime.controlledCursorCaptureNavigationPaused',
    status: VideoRecordingStatus.PAUSED,
  });
});

it('does not write setup failure after a stale pause failure settles', async () => {
  const flush = createDeferred<null>();
  disableControlledCursorCaptureMock.mockReturnValueOnce(flush.promise);

  expect(handleControlledCursorNavigationStart(7)).toBe(true);
  await flushMicrotasks();
  makeNavigationStale();
  flush.reject(new Error('content gone'));
  await flushMicrotasks();

  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({
    error: 'background.runtime.controlledCursorCaptureSetupFailed',
    status: VideoRecordingStatus.PAUSED,
  });
});

it('does not clear errors after a stale resume command settles', async () => {
  const resume = createDeferred<void>();
  controlledCursorState.epoch = 1;
  controlledCursorState.pending = true;
  sendRuntimeMessageMock.mockReturnValueOnce(resume.promise);

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await flushMicrotasks();
  makeNavigationStale();
  resume.resolve();
  await flushMicrotasks();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({ error: null });
  expect(clearControlledCursorNavigationPendingMock).not.toHaveBeenCalled();
});

it('does not clear errors after stale content pause sync settles', async () => {
  const pauseSync = createDeferred<void>();
  controlledCursorState.epoch = 1;
  controlledCursorState.pending = true;
  isControlledCursorAutoPausedMock.mockReturnValue(false);
  syncControlledCursorCaptureMock.mockReturnValueOnce(pauseSync.promise);

  expect(handleControlledCursorTabUpdate(7, 'complete')).toBe(true);
  await flushMicrotasks();
  makeNavigationStale();
  pauseSync.resolve();
  await flushMicrotasks();

  expect(syncControlledCursorCaptureMock).toHaveBeenCalledWith(7, 'pause');
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith({ error: null });
  expect(clearControlledCursorNavigationPendingMock).not.toHaveBeenCalled();
});
