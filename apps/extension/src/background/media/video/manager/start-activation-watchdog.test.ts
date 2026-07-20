import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  OFFSCREEN_RECORDING_START_TIMEOUT_MS,
  RECORDING_START_ACTIVATION_TIMEOUT_MS,
} from '@sniptale/runtime-contracts/video/types/timeouts';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
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
    sendRuntimeMessage: vi.fn(() => Promise.resolve({ success: true, result: 'accepted' })),
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
  expect(deps.clearActiveLease).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ shouldClear: expect.any(Function) })
  );
  expect(deps.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
});

it('keeps the background watchdog behind the offscreen start timeout', () => {
  expect(RECORDING_START_ACTIVATION_TIMEOUT_MS).toBeGreaterThan(
    OFFSCREEN_RECORDING_START_TIMEOUT_MS
  );
});

it('clears the stale lease before exposing a retryable start failure', async () => {
  const deps = createDeps();
  const cleanup = createDeferred<void>();
  deps.clearActiveLease.mockReturnValueOnce(cleanup.promise);

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  expect(deps.clearActiveLease).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ shouldClear: expect.any(Function) })
  );
  expect(deps.notifyStartFailed).not.toHaveBeenCalled();
  expect(deps.sendRuntimeMessage).not.toHaveBeenCalled();

  cleanup.resolve();
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith('t:background.runtime.recordingStartTimeout');
  expect(deps.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
});

it('does not fail a recording that activates while timeout cleanup is pending', async () => {
  const deps = createDeps();
  const cleanup = createDeferred<void>();
  deps.clearActiveLease.mockReturnValueOnce(cleanup.promise);

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);

  deps.isPreparing.mockReturnValue(false);
  cleanup.resolve();
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();

  expect(deps.notifyStartFailed).not.toHaveBeenCalled();
  expect(deps.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('does not expose a retryable failure when stale lease cleanup fails', async () => {
  const deps = createDeps();
  deps.clearActiveLease.mockRejectedValueOnce(new Error('storage unavailable'));

  scheduleRecordingStartActivationWatchdog('recording-1', deps);
  await vi.advanceTimersByTimeAsync(RECORDING_START_ACTIVATION_TIMEOUT_MS);
  await Promise.resolve();

  expect(deps.clearActiveLease).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ shouldClear: expect.any(Function) })
  );
  expect(deps.notifyStartFailed).not.toHaveBeenCalled();
  expect(deps.sendRuntimeMessage).not.toHaveBeenCalled();
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
