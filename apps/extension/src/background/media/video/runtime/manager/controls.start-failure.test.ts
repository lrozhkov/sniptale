import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../routing-contracts/runtime-messaging/mock';

const {
  getVideoRecordingTabIdMock,
  isControlledCursorCaptureEnabledMock,
  resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeStateMock,
  resetVideoRecordingStartSessionMock,
  sendRuntimeMessageMock,
  sendTabMessageMock,
  setVideoRecordingIdMock,
  loggerErrorMock,
  loggerWarnMock,
  getVideoRecordingIdMock,
  releaseVideoCaptureSurfaceMock,
  cancelVideoSourceReadyWaitMock,
  runBestEffortMock,
} = vi.hoisted(() => ({
  getVideoRecordingTabIdMock: vi.fn(),
  isControlledCursorCaptureEnabledMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  cancelVideoSourceReadyWaitMock: vi.fn(),
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
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  isControlledCursorCaptureEnabled: isControlledCursorCaptureEnabledMock,
  resetVideoRecordingStartSession: resetVideoRecordingStartSessionMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  cancelVideoSourceReadyWait: cancelVideoSourceReadyWaitMock,
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
}));

import { notifyRecordingStartFailed } from './controls.start-failure';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingTabIdMock.mockReturnValue(7);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  isControlledCursorCaptureEnabledMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  sendTabMessageMock.mockResolvedValue(undefined);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
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
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({ error: 'permission denied' });
}

async function verifyStartFailureBroadcast(): Promise<void> {
  await notifyRecordingStartFailed('permission denied');

  expect(loggerErrorMock).toHaveBeenCalledWith('Recording start failed', 'permission denied');
  expect(cancelVideoSourceReadyWaitMock).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ message: 'permission denied' })
  );
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.HIDE_RECORDING_OVERLAY,
  });
  expectRuntimeStateReset();
  expectStartFailureBroadcast();
}

async function verifyControlledCursorTeardown(): Promise<void> {
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);

  await notifyRecordingStartFailed('permission denied');

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

  await notifyRecordingStartFailed('permission denied');
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

async function verifyNoRecordingTabReset(): Promise<void> {
  getVideoRecordingTabIdMock.mockReturnValue(null);

  await notifyRecordingStartFailed('permission denied');

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expectRuntimeStateReset();
  expectStartFailureBroadcast();
}

it('preserves recording authority when the capture surface cannot be restored', async () => {
  releaseVideoCaptureSurfaceMock.mockRejectedValueOnce(new Error('restore-conflict'));

  await expect(notifyRecordingStartFailed('permission denied')).rejects.toThrow('restore-conflict');

  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingStartSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('reports a cleanup failure without releasing durable session authority', async () => {
  await notifyRecordingStartFailed('offscreen unavailable', { retainAuthority: true });

  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingStartSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.RECORDING_START_FAILED,
    error: 'offscreen unavailable',
  });
});

it('does not let delayed start-failure cleanup for A reset current recording B', async () => {
  let resolveRelease!: () => void;
  releaseVideoCaptureSurfaceMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveRelease = resolve;
    })
  );

  const cleanupA = notifyRecordingStartFailed('permission denied', {
    recordingId: 'recording-1',
  });
  await vi.waitFor(() =>
    expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('recording-1')
  );
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  resolveRelease();
  await cleanupA;

  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingStartSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});
