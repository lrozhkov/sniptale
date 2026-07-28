import { afterEach, expect, it, vi } from 'vitest';

import { allowRecordingBegin, cancelRecordingBegin, waitForRecordingBegin } from './gate';

const binding = { generation: 1, recordingId: 'recording-1', streamInstanceId: 'stream-1' };

afterEach(() => {
  cancelRecordingBegin();
  vi.useRealTimers();
});

it('times out a prepared source when background never activates it', async () => {
  vi.useFakeTimers();
  const pending = waitForRecordingBegin(binding);
  const expectation = expect(pending).rejects.toThrow('Timed out while waiting');
  await vi.advanceTimersByTimeAsync(10_000);
  await expectation;
});

it('keeps the activation gate open for the supported ten-second countdown plus its deadline', async () => {
  vi.useFakeTimers();
  const pending = waitForRecordingBegin(binding, 10_000);
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });

  await vi.advanceTimersByTimeAsync(10_000);
  expect(settled).toBe(false);
  allowRecordingBegin(binding);
  await expect(pending).resolves.toBeUndefined();
});

it('allows only the exact pending recording binding', async () => {
  const pending = waitForRecordingBegin(binding);
  allowRecordingBegin(binding);
  await expect(pending).resolves.toBeUndefined();
});

it('rejects parallel gates and stale begin signals', async () => {
  const pending = waitForRecordingBegin(binding);
  await expect(waitForRecordingBegin({ ...binding, recordingId: 'recording-2' })).rejects.toThrow(
    'Another recording start gate is active'
  );
  expect(() => allowRecordingBegin({ ...binding, streamInstanceId: 'stale-stream' })).toThrow(
    'Stale or mismatched'
  );

  cancelRecordingBegin('source denied');
  await expect(pending).rejects.toThrow('source denied');
});

it('cancels safely with and without a pending gate', async () => {
  const pending = waitForRecordingBegin(binding);
  cancelRecordingBegin();
  await expect(pending).rejects.toThrow('Recording start was cancelled');
  expect(() => cancelRecordingBegin()).not.toThrow();
});
