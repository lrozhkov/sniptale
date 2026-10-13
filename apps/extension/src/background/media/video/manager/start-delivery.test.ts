import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateLease: vi.fn(),
  beginPreparedRecording: vi.fn(),
  scheduleWatchdog: vi.fn(),
  enableHistory: vi.fn(),
  createClock: vi.fn(),
  closeClock: vi.fn(),
}));

vi.mock('./frame-clock-companion', () => ({
  createRecordingFrameClockCompanion: mocks.createClock,
  closeRecordingFrameClockCompanions: mocks.closeClock,
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
  mocks.createClock.mockResolvedValue(null);
  mocks.closeClock.mockResolvedValue(undefined);
});

it('delivers optional native clock admission at BEGIN without a receipt-time history reset', async () => {
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
  expect(mocks.createClock).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
  expect(mocks.beginPreparedRecording).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    frameClockLease: null,
  });
  expect(mocks.enableHistory).not.toHaveBeenCalled();
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

  expect(mocks.enableHistory).not.toHaveBeenCalled();
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

it('passes a fresh exact clock lease unchanged through bound BEGIN and cleans failed delivery', async () => {
  const { RECORDING_FRAME_CLOCK_PURPOSE } =
    await import('../../../../contracts/video/recording-frame-clock');
  const lease = {
    recordingId: 'recording-1',
    generation: 3,
    streamInstanceId: 'stream-1',
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    expiresAtEpochMs: Date.now() + 10000,
  };
  mocks.createClock.mockResolvedValue(lease);
  mocks.beginPreparedRecording.mockRejectedValueOnce(new Error('BEGIN transport failed'));
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        tabId: 7,
        settings: {},
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).rejects.toThrow('BEGIN transport failed');
  expect(mocks.beginPreparedRecording).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    frameClockLease: lease,
  });
  expect(mocks.closeClock).toHaveBeenCalledExactlyOnceWith('recording-1');
  expect(mocks.activateLease).not.toHaveBeenCalled();
});
