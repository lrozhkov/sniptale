import { beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const {
  isVideoRecordingStartCancelled,
  setVideoRecordingCountdownSessionId,
  setVideoRecordingRuntimeState,
  waitForCountdownTimer,
} = vi.hoisted(() => ({
  isVideoRecordingStartCancelled: vi.fn(),
  setVideoRecordingCountdownSessionId: vi.fn(),
  setVideoRecordingRuntimeState: vi.fn(),
  waitForCountdownTimer: vi.fn(),
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  setVideoRecordingCountdownSessionId,
}));

vi.mock('../runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/session-state')>()),
  setVideoRecordingRuntimeState,
}));

vi.mock('../ui/countdown', () => ({
  waitForCountdownTimer,
}));

vi.mock('./flow-cancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow-cancellation')>()),
  isVideoRecordingStartCancelled,
}));

import {
  handleIncompleteVideoRecordingCountdown,
  runVideoRecordingCountdown,
} from './flow-countdown';
import { videoManagerSession } from './session';

const defaultSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 0,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: true,
  quality: VideoQuality.HIGH,
  systemAudioEnabled: true,
};

function resetCountdownState(): void {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'session-1'),
  });
  vi.setSystemTime(new Date('2026-03-21T09:00:00.000Z'));
  videoManagerSession.currentCountdownSessionId = null;
  waitForCountdownTimer.mockResolvedValue(true);
  isVideoRecordingStartCancelled.mockReturnValue(false);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetCountdownState();
});

it('enters COUNTDOWN state and clears the session id after a successful countdown', async () => {
  await expect(runVideoRecordingCountdown(7, CaptureMode.TAB, defaultSettings)).resolves.toBe(true);

  expect(setVideoRecordingCountdownSessionId).toHaveBeenNthCalledWith(1, 'session-1');
  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.COUNTDOWN,
    countdownEndsAt: Date.now() + 3000,
  });
  expect(waitForCountdownTimer).toHaveBeenCalledWith('session-1', 3000, expect.any(Function));
  expect(setVideoRecordingCountdownSessionId).toHaveBeenLastCalledWith(null);
});

it('uses PREPARING state when countdown is disabled', async () => {
  await expect(
    runVideoRecordingCountdown(9, CaptureMode.SCREEN, {
      ...defaultSettings,
      countdownSeconds: 0,
    })
  ).resolves.toBe(true);

  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PREPARING,
    countdownEndsAt: null,
  });
  expect(waitForCountdownTimer).toHaveBeenCalledWith('session-1', 0, expect.any(Function));
});

it('runs incomplete-countdown cleanup when the timer does not complete', async () => {
  waitForCountdownTimer.mockResolvedValue(false);
  videoManagerSession.currentCountdownSessionId = 'session-1';

  await expect(runVideoRecordingCountdown(5, CaptureMode.TAB, defaultSettings)).resolves.toBe(
    false
  );

  expect(setVideoRecordingCountdownSessionId).toHaveBeenLastCalledWith(null);
});

it('clears an incomplete camera countdown session without requiring a tab', async () => {
  videoManagerSession.currentCountdownSessionId = 'session-1';

  await handleIncompleteVideoRecordingCountdown('session-1', null);

  expect(setVideoRecordingCountdownSessionId).toHaveBeenCalledWith(null);
});

it('skips incomplete-countdown cleanup when another session has replaced the timer', async () => {
  videoManagerSession.currentCountdownSessionId = 'other-session';

  await handleIncompleteVideoRecordingCountdown('session-1', 12);

  expect(setVideoRecordingCountdownSessionId).not.toHaveBeenCalled();
});
