import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../routing-contracts/runtime-messaging/mock';

const {
  getVideoRecordingTabIdMock,
  isControlledCursorCaptureEnabledMock,
  resetVideoRecordingRuntimeStateMock,
  resetVideoRecordingStartSessionMock,
  sendRuntimeMessageMock,
  sendTabMessageMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
  loggerErrorMock,
  loggerWarnMock,
  runBestEffortMock,
} = vi.hoisted(() => ({
  getVideoRecordingTabIdMock: vi.fn(),
  isControlledCursorCaptureEnabledMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  runBestEffortMock: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: runBestEffortMock,
}));

vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  isControlledCursorCaptureEnabled: isControlledCursorCaptureEnabledMock,
  resetVideoRecordingStartSession: resetVideoRecordingStartSessionMock,
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));

import { notifyRecordingStartFailed } from './controls.start-failure';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingTabIdMock.mockReturnValue(7);
  isControlledCursorCaptureEnabledMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  sendTabMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({
    sendRuntimeMessage: sendRuntimeMessageMock,
    sendTabMessage: sendTabMessageMock,
  });
  runBestEffortMock.mockImplementation(
    (
      promise: Promise<unknown>,
      logger: { warn: typeof loggerWarnMock },
      message: string,
      meta?: unknown
    ) => {
      void promise.catch((error) => {
        if (meta === undefined) {
          logger.warn(message, error);
          return;
        }

        logger.warn(message, meta, error);
      });
    }
  );
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('controls.start-failure', () => {
  it(
    'broadcasts start failures, hides the overlay, and resets runtime state',
    verifyStartFailureBroadcast
  );
  it(
    'tears down controlled cursor capture before resetting the failed start session',
    verifyControlledCursorTeardown
  );
  it('logs warnings when fail-soft start-failure notifications reject', verifyFailSoftWarningLogs);
  it(
    'still resets runtime state when start failure has no recording tab',
    verifyNoRecordingTabReset
  );
});

function expectStartFailureBroadcast(): void {
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.RECORDING_START_FAILED,
    error: 'permission denied',
  });
}

function expectRuntimeStateReset(): void {
  expect(setVideoRecordingIdMock).toHaveBeenCalledWith(null);
  expect(setOpenEditorAfterRecordingMock).toHaveBeenCalledWith(false);
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
}

function verifyStartFailureBroadcast(): void {
  notifyRecordingStartFailed('permission denied');

  expect(loggerErrorMock).toHaveBeenCalledWith('Recording start failed', 'permission denied');
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.HIDE_RECORDING_OVERLAY,
  });
  expectRuntimeStateReset();
  expectStartFailureBroadcast();
}

function verifyControlledCursorTeardown(): void {
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);

  notifyRecordingStartFailed('permission denied');

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 7, {
    type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(2, 7, {
    type: VideoMessageType.HIDE_RECORDING_OVERLAY,
  });
  expect(sendTabMessageMock.mock.invocationCallOrder[1]).toBeLessThan(
    resetVideoRecordingStartSessionMock.mock.invocationCallOrder[0] ?? 0
  );
}

async function verifyFailSoftWarningLogs(): Promise<void> {
  sendTabMessageMock.mockRejectedValueOnce(new Error('overlay closed'));
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));

  notifyRecordingStartFailed('permission denied');
  await flushPromises();

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to hide recording overlay after start failure',
    { tabId: 7 },
    expect.any(Error)
  );
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to broadcast recording start failure',
    expect.any(Error)
  );
}

function verifyNoRecordingTabReset(): void {
  getVideoRecordingTabIdMock.mockReturnValue(null);

  notifyRecordingStartFailed('permission denied');

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expectRuntimeStateReset();
  expectStartFailureBroadcast();
}
