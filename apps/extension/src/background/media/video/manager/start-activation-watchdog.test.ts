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
    clearActiveLease: vi.fn(() => Promise.resolve()),
    notifyStartFailed: vi.fn(),
    getSourceBinding: vi.fn(() => ({
      generation: 2,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    })),
    stopOffscreenRecording: vi.fn(() => Promise.resolve(true)),
    translate: vi.fn((key: string) => `t:${key}`),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearRecordingStartActivationWatchdog();
});

afterEach(() => {
  clearRecordingStartActivationWatchdog();
  vi.useRealTimers();
});

it('fails preparing starts when offscreen never reports recorder activation', async () => {
  const deps = createDeps();

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  expect(deps.translate).toHaveBeenCalledWith('background.runtime.recordingStartTimeout');
  expect(deps.notifyStartFailed).toHaveBeenCalledWith('t:background.runtime.recordingStartTimeout');
  expect(deps.stopOffscreenRecording).toHaveBeenCalledWith({
    generation: 2,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  expect(deps.clearActiveLease).toHaveBeenCalledWith('recording-1');
});

it('keeps the background watchdog behind the offscreen start timeout', () => {
  expect(RECORDING_START_ACTIVATION_TIMEOUT_MS).toBeGreaterThan(
    OFFSCREEN_RECORDING_START_TIMEOUT_MS
  );
});

it('keeps durable authority until identity-bound offscreen cleanup succeeds', async () => {
  const deps = createDeps();
  const cleanup = createDeferred<boolean>();
  deps.stopOffscreenRecording.mockReturnValueOnce(cleanup.promise);

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  expect(deps.notifyStartFailed).not.toHaveBeenCalled();
  expect(deps.clearActiveLease).not.toHaveBeenCalled();

  cleanup.resolve(true);
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith('t:background.runtime.recordingStartTimeout');
  expect(deps.clearActiveLease).toHaveBeenCalledWith('recording-1');
});

it('finishes timeout cleanup when activation races with an accepted bound stop', async () => {
  const deps = createDeps();
  const cleanup = createDeferred<boolean>();
  deps.stopOffscreenRecording.mockReturnValueOnce(cleanup.promise);

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  deps.isPreparing.mockReturnValue(false);
  cleanup.resolve(true);
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();

  expect(deps.notifyStartFailed).toHaveBeenCalledOnce();
  expect(deps.clearActiveLease).toHaveBeenCalledWith('recording-1');
});

it.each([
  ['rejection', () => Promise.reject(new Error('offscreen unavailable'))],
  ['resolved false', () => Promise.resolve(false)],
])('retains authority when activation-timeout cleanup has a %s', async (_label, createResult) => {
  const deps = createDeps();
  deps.stopOffscreenRecording.mockImplementationOnce(createResult);

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
  await Promise.resolve();

  expect(deps.notifyStartFailed).not.toHaveBeenCalled();
  expect(deps.clearActiveLease).not.toHaveBeenCalled();
});

it('does not fail stale or cleared activation waits', async () => {
  const staleDeps = createDeps();
  staleDeps.getRecordingId.mockReturnValue('recording-2');
  scheduleRecordingStartActivationWatchdog('recording-1', staleDeps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  expect(staleDeps.notifyStartFailed).not.toHaveBeenCalled();

  const clearedDeps = createDeps();
  scheduleRecordingStartActivationWatchdog('recording-1', clearedDeps);
  clearRecordingStartActivationWatchdog('recording-1');
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  expect(clearedDeps.notifyStartFailed).not.toHaveBeenCalled();
});
