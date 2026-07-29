import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingPreparationMock,
  finalizeRecordingStartMock,
  hasActiveVideoRecordingSessionMock,
  initializeRecordingContextMock,
  isStartCancelledMock,
  isVideoRecordingPreparationInProgressMock,
  issuePreparedVideoRecordingLeaseMock,
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
  hasActiveVideoRecordingSessionMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  isStartCancelledMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  issuePreparedVideoRecordingLeaseMock: vi.fn(),
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
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
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
vi.mock('./recording-context.prepare', () => ({
  initializeRecordingContext: initializeRecordingContextMock,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: scheduleRecordingStartActivationWatchdogMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  activateVideoRecordingLease: vi.fn().mockResolvedValue({ controlToken: 'control-token-1' }),
  issuePreparedVideoRecordingLease: issuePreparedVideoRecordingLeaseMock,
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
    generation: 1,
    settings: { ...multiSourceSettings, controlledCursorCaptureEnabled: false },
    surface: null,
    tabId: 17,
    viewport: { devicePixelRatio: 1, height: 900, scrollX: 0, scrollY: 0, width: 1440 },
    viewportPresetId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);
  initializeRecordingContextMock.mockResolvedValue(createPreparedScreenContext());
  isStartCancelledMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  issuePreparedVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'prepared-token',
    recordingId: 'recording-1',
  });
  runCountdownMock.mockResolvedValue(true);
  sendRuntimeMessageMock.mockImplementation((message: { type?: string }) =>
    message.type === VideoMessageType.OFFSCREEN_STOP_RECORDING
      ? Promise.resolve({ success: true, result: 'accepted' })
      : Promise.resolve(undefined)
  );
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
});

it('disposes prepared multi-source streams when lease issue fails after preparation', async () => {
  issuePreparedVideoRecordingLeaseMock.mockResolvedValueOnce(null);
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
    'Failed to issue recording control capability',
    { retainAuthority: false }
  );
});

it('disposes prepared multi-source streams and resets state when start is cancelled after countdown', async () => {
  isStartCancelledMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

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
  expect(finalizeRecordingStartMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingIdMock).toHaveBeenLastCalledWith(null);
  expect(setOpenEditorAfterRecordingMock).toHaveBeenLastCalledWith(false);
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
});

it.each([
  ['resolved false', () => Promise.resolve({ success: false, error: 'stop rejected' })],
  ['transport rejection', () => Promise.reject(new Error('offscreen unavailable'))],
])('retains start authority when every bound cleanup attempt has a %s', async (_label, fail) => {
  runCountdownMock.mockResolvedValueOnce(false);
  sendRuntimeMessageMock.mockImplementation((message: { type?: string }) => {
    if (message.type === VideoMessageType.OFFSCREEN_STOP_RECORDING) return fail();
    return Promise.resolve(undefined);
  });

  const result = await startRecording(
    17,
    multiSourceSettings,
    CaptureMode.SCREEN,
    undefined,
    ownerSenderUrl
  );

  expect(result).toEqual({
    error: 'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    result: 'failed',
  });
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    { retainAuthority: true }
  );
  expect(setVideoRecordingIdMock).not.toHaveBeenCalledWith(null);
  expect(resetVideoRecordingStartSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'recording-1',
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    })
  );
});
