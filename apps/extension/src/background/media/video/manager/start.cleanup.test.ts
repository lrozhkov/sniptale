import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingPreparationMock,
  finalizeRecordingStartMock,
  hasActiveVideoRecordingTabMock,
  initializeRecordingContextMock,
  isStartCancelledMock,
  isVideoRecordingPreparationInProgressMock,
  issueActiveVideoRecordingLeaseMock,
  notifyRecordingStartFailedMock,
  runCountdownMock,
  scheduleRecordingStartActivationWatchdogMock,
  sendRuntimeMessageMock,
  resetVideoRecordingRuntimeStateMock,
  resetVideoRecordingStartSessionMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
} = vi.hoisted(() => ({
  beginVideoRecordingPreparationMock: vi.fn(),
  finalizeRecordingStartMock: vi.fn(),
  hasActiveVideoRecordingTabMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  isStartCancelledMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  issueActiveVideoRecordingLeaseMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  runCountdownMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  beginVideoRecordingPreparation: beginVideoRecordingPreparationMock,
  hasActiveVideoRecordingTab: hasActiveVideoRecordingTabMock,
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  resetVideoRecordingStartSession: resetVideoRecordingStartSessionMock,
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('../runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  finalizeRecordingStart: finalizeRecordingStartMock,
  isStartCancelled: isStartCancelledMock,
  runCountdown: runCountdownMock,
}));
vi.mock('./recording-context', () => ({
  initializeRecordingContext: initializeRecordingContextMock,
  normalizeViewportPreset: vi.fn(() => undefined),
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: scheduleRecordingStartActivationWatchdogMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  issueActiveVideoRecordingLease: issueActiveVideoRecordingLeaseMock,
}));
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { startRecording } from './start';

const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

const multiSourceSettings: VideoRecordingSettings = {
  autoFadeDelay: 1500,
  controlledCursorCaptureEnabled: true,
  countdownSeconds: 0,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  sourceCount: 3,
  systemAudioEnabled: true,
};

function createPreparedScreenContext() {
  return {
    captureMode: CaptureMode.SCREEN,
    captureSource: { mode: CaptureMode.SCREEN, streamId: 'stream-1' },
    settings: { ...multiSourceSettings, controlledCursorCaptureEnabled: false },
    tabId: 17,
    viewport: { devicePixelRatio: 1, height: 900, scrollX: 0, scrollY: 0, width: 1440 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  hasActiveVideoRecordingTabMock.mockReturnValue(false);
  initializeRecordingContextMock.mockResolvedValue(createPreparedScreenContext());
  isStartCancelledMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  issueActiveVideoRecordingLeaseMock.mockResolvedValue(null);
  runCountdownMock.mockResolvedValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
});

it('disposes prepared multi-source streams when lease issue fails after preparation', async () => {
  const result = await startRecording(
    17,
    multiSourceSettings,
    CaptureMode.SCREEN,
    undefined,
    ownerSenderUrl
  );

  expect(result).toEqual({
    error: 'Failed to issue recording control capability',
    result: 'failed',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
    })
  );
  expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Failed to issue recording control capability'
  );
});

it('disposes prepared multi-source streams and resets state when start is cancelled after countdown', async () => {
  isStartCancelledMock.mockReturnValue(true);

  const result = await startRecording(
    17,
    multiSourceSettings,
    CaptureMode.SCREEN,
    undefined,
    ownerSenderUrl
  );

  expect(result).toEqual({ result: 'cancelled' });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
    })
  );
  expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
  expect(setVideoRecordingIdMock).toHaveBeenLastCalledWith(null);
  expect(setOpenEditorAfterRecordingMock).toHaveBeenLastCalledWith(false);
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
});
