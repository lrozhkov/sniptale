import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateLease: vi.fn(),
  beginPreparedRecording: vi.fn(),
  scheduleWatchdog: vi.fn(),
}));

vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  activateVideoRecordingLease: mocks.activateLease,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  beginPreparedRecording: mocks.beginPreparedRecording,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: mocks.scheduleWatchdog,
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { finalizeAcceptedRecordingStart } from './start-delivery';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginPreparedRecording.mockResolvedValue(undefined);
  mocks.activateLease.mockResolvedValue({ controlToken: 'active-token' });
});

it('publishes the active lease only after the bound recorder begin succeeds', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        settings: { openEditorAfterRecording: false },
        viewportPresetId: 'preset-1',
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ controlToken: 'active-token', result: 'accepted' });

  expect(mocks.beginPreparedRecording.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.activateLease.mock.invocationCallOrder[0]!
  );
  expect(mocks.activateLease).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
});

it('leaves identity-bound cleanup to the start owner when activation persistence fails', async () => {
  mocks.activateLease.mockRejectedValueOnce(new Error('activation persistence failed'));

  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        settings: { openEditorAfterRecording: false },
        viewportPresetId: 'preset-1',
      },
      'stream-1'
    )
  ).rejects.toThrow('activation persistence failed');

  expect(mocks.scheduleWatchdog).not.toHaveBeenCalled();
});

it('activates a prepared multi-source recording without a redundant begin command', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.SCREEN,
        generation: 3,
        settings: { openEditorAfterRecording: false, sourceCount: 2 },
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ controlToken: 'active-token', result: 'accepted' });

  expect(mocks.beginPreparedRecording).not.toHaveBeenCalled();
  expect(mocks.activateLease).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
});
