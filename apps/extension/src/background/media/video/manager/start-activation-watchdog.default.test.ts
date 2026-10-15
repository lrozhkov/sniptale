import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RECORDING_START_ACTIVATION_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';

const mocks = vi.hoisted(() => ({
  clearActiveLease: vi.fn(),
  getActiveLease: vi.fn(),
  getRecordingId: vi.fn(),
  isPreparing: vi.fn(),
  loggerWarn: vi.fn(),
  notifyStartFailed: vi.fn(),
  requestBoundStop: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  clearActiveVideoRecordingLease: mocks.clearActiveLease,
  getActiveVideoRecordingLeaseSnapshot: mocks.getActiveLease,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  getVideoRecordingId: mocks.getRecordingId,
  isVideoRecordingPreparationInProgress: mocks.isPreparing,
}));

vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed: mocks.notifyStartFailed,
}));

vi.mock('../runtime/recording-completion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/recording-completion')>()),
  failRecordingStartAfterTimeout: mocks.notifyStartFailed,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: mocks.loggerWarn,
  }),
}));

import {
  clearRecordingStartActivationWatchdog,
  scheduleRecordingStartActivationWatchdog,
} from './start-activation-watchdog';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  clearRecordingStartActivationWatchdog();
  mocks.getRecordingId.mockReturnValue('recording-1');
  mocks.isPreparing.mockReturnValue(true);
  mocks.getActiveLease.mockReturnValue({
    recordingId: 'recording-1',
    surfaceBinding: { generation: 3, streamInstanceId: 'stream-instance-1' },
  });
  mocks.requestBoundStop.mockResolvedValue({ terminalError: null });
  mocks.clearActiveLease.mockResolvedValue(undefined);
  mocks.notifyStartFailed.mockResolvedValue(undefined);
  mocks.translate.mockReturnValue('Recording start timed out');
});

afterEach(() => {
  clearRecordingStartActivationWatchdog();
  vi.useRealTimers();
});

it('routes the default timer to the completion owner with its original identity', async () => {
  scheduleRecordingStartActivationWatchdog('recording-1');
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
  expect(mocks.notifyStartFailed).toHaveBeenCalledExactlyOnceWith(
    'recording-1',
    'Recording start timed out'
  );
  expect(mocks.requestBoundStop).not.toHaveBeenCalled();
  expect(mocks.clearActiveLease).not.toHaveBeenCalled();
});
