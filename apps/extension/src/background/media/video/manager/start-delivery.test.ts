import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateLease: vi.fn(),
  beginPreparedRecording: vi.fn(),
  scheduleWatchdog: vi.fn(),
  enableHistory: vi.fn(),
}));

vi.mock('../runtime/manager/controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager/controlled-cursor/messages')>()),
  enableControlledCursorCapture: mocks.enableHistory,
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
  mocks.enableHistory.mockResolvedValue(undefined);
});

it('starts ordinary tab action history at recorder begin, after preflight and countdown', async () => {
  await finalizeAcceptedRecordingStart(
    'recording-1',
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      tabId: 7,
      settings: {},
      viewportPresetId: null,
    },
    'stream-1'
  );
  expect(mocks.enableHistory).toHaveBeenCalledWith(7, 'recording-1', 0);
  expect(mocks.beginPreparedRecording.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.enableHistory.mock.invocationCallOrder[0]!
  );
});

it('keeps an accepted video recording when optional action history is unavailable', async () => {
  mocks.enableHistory.mockRejectedValueOnce(new Error('No receiver'));
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB_CROP,
        generation: 3,
        tabId: 7,
        settings: {},
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ result: 'accepted' });
  expect(mocks.activateLease).toHaveBeenCalledOnce();
});

it('publishes the active lease only after the bound recorder begin succeeds', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        settings: {},
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
        tabId: 7,
        settings: {},
        viewportPresetId: 'preset-1',
      },
      'stream-1'
    )
  ).rejects.toThrow('activation persistence failed');

  expect(mocks.enableHistory).toHaveBeenCalledWith(7, 'recording-1', 0);
  expect(mocks.scheduleWatchdog).not.toHaveBeenCalled();
});

it('activates a prepared multi-source recording without a redundant begin command', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.SCREEN,
        generation: 3,
        settings: { sourceCount: 2 },
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
