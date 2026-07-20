import { beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';

const {
  clearViewport,
  createLogger,
  detachDebugger,
  isVideoRecordingStartCancelled,
  logger,
  notifyRecordingStartFailed,
  setVideoRecordingCountdownSessionId,
  setVideoRecordingRuntimeState,
  translate,
  waitForCountdownTimer,
} = vi.hoisted(() => ({
  clearViewport: vi.fn(),
  createLogger: vi.fn(() => logger),
  detachDebugger: vi.fn(),
  isVideoRecordingStartCancelled: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
  notifyRecordingStartFailed: vi.fn(),
  setVideoRecordingCountdownSessionId: vi.fn(),
  setVideoRecordingRuntimeState: vi.fn(),
  translate: vi.fn(),
  waitForCountdownTimer: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger,
}));

vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed,
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

vi.mock('../../../debugger/session/detach', () => ({
  detachDebugger,
}));

vi.mock('../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/workspace')>()),
  clearViewport,
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
  autoFadeDelay: 0,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: true,
  openEditorAfterRecording: false,
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
  translate.mockReturnValue('countdown incomplete');
  waitForCountdownTimer.mockResolvedValue(true);
  clearViewport.mockResolvedValue(undefined);
  detachDebugger.mockResolvedValue(undefined);
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

  await expect(
    runVideoRecordingCountdown(5, CaptureMode.VIEWPORT_EMULATION, defaultSettings)
  ).resolves.toBe(false);

  expect(clearViewport).toHaveBeenCalledWith(5);
  expect(detachDebugger).toHaveBeenCalledWith(5, 'video-emulation');
  expect(clearViewport.mock.invocationCallOrder[0]!).toBeLessThan(
    detachDebugger.mock.invocationCallOrder[0]!
  );
  expect(translate).toHaveBeenCalledWith('background.runtime.countdownIncomplete');
  expect(notifyRecordingStartFailed).toHaveBeenCalledWith('countdown incomplete');
});

it('skips viewport cleanup for camera countdown sessions without a tab', async () => {
  videoManagerSession.currentCountdownSessionId = 'session-1';

  await handleIncompleteVideoRecordingCountdown('session-1', null);

  expect(clearViewport).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
  expect(notifyRecordingStartFailed).toHaveBeenCalledWith('countdown incomplete');
});

it('continues incomplete-countdown cleanup when viewport clear fails', async () => {
  videoManagerSession.currentCountdownSessionId = 'session-1';
  clearViewport.mockRejectedValueOnce(new Error('clear failed'));

  await handleIncompleteVideoRecordingCountdown('session-1', 5);

  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to clear viewport emulation before incomplete-countdown detach',
    { tabId: 5 },
    expect.any(Error)
  );
  expect(detachDebugger).toHaveBeenCalledWith(5, 'video-emulation');
  expect(notifyRecordingStartFailed).toHaveBeenCalledWith('countdown incomplete');
});

it('logs a warning when countdown cleanup cannot detach the debugger', async () => {
  videoManagerSession.currentCountdownSessionId = 'session-1';
  detachDebugger.mockRejectedValueOnce(new Error('detach failed'));

  await handleIncompleteVideoRecordingCountdown('session-1', 5);

  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to detach viewport emulation debugger after incomplete countdown',
    { tabId: 5 },
    expect.any(Error)
  );
  expect(notifyRecordingStartFailed).toHaveBeenCalledWith('countdown incomplete');
});

it('skips incomplete-countdown cleanup when another session has replaced the timer', async () => {
  videoManagerSession.currentCountdownSessionId = 'other-session';

  await handleIncompleteVideoRecordingCountdown('session-1', 12);

  expect(setVideoRecordingCountdownSessionId).not.toHaveBeenCalled();
  expect(clearViewport).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
  expect(notifyRecordingStartFailed).not.toHaveBeenCalled();
});
