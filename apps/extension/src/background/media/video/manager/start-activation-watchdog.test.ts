import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  OFFSCREEN_RECORDING_START_TIMEOUT_MS,
  RECORDING_START_ACTIVATION_TIMEOUT_MS,
} from '@sniptale/runtime-contracts/video/types/timeouts';
import {
  clearRecordingStartActivationWatchdog,
  scheduleRecordingStartActivationWatchdog,
} from './start-activation-watchdog';

function createDeps() {
  return {
    getRecordingId: vi.fn(() => 'recording-1'),
    isPreparing: vi.fn(() => true),
    failStart: vi.fn(async () => undefined),
    translate: vi.fn((key: string) => `t:${key}`),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearRecordingStartActivationWatchdog();
});

afterEach(() => {
  clearRecordingStartActivationWatchdog();
  vi.useRealTimers();
});

it('delegates an expired preparing start to the completion owner exactly once', async () => {
  const deps = createDeps();
  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS - 1);
  expect(deps.failStart).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(deps.failStart).toHaveBeenCalledExactlyOnceWith(
    'recording-1',
    't:background.runtime.recordingStartTimeout'
  );
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
  expect(deps.failStart).toHaveBeenCalledOnce();
});

it('keeps the background watchdog behind the offscreen start timeout', () => {
  expect(RECORDING_START_ACTIVATION_TIMEOUT_MS).toBeGreaterThan(
    OFFSCREEN_RECORDING_START_TIMEOUT_MS
  );
});

it.each(['stale', 'activated', 'cleared'] as const)(
  'does not fail a %s activation wait',
  async (state) => {
    const deps = createDeps();
    scheduleRecordingStartActivationWatchdog('recording-1', deps);
    if (state === 'stale') deps.getRecordingId.mockReturnValue('recording-2');
    if (state === 'activated') deps.isPreparing.mockReturnValue(false);
    if (state === 'cleared') clearRecordingStartActivationWatchdog('recording-1');
    await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
    expect(deps.failStart).not.toHaveBeenCalled();
  }
);

it('replaces the old timer and ignores clearing a different identity', async () => {
  const deps = createDeps();
  scheduleRecordingStartActivationWatchdog('old', deps);
  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  clearRecordingStartActivationWatchdog('old');
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
  expect(deps.failStart).toHaveBeenCalledExactlyOnceWith(
    'recording-1',
    't:background.runtime.recordingStartTimeout'
  );
});
