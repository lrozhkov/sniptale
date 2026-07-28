import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
const {
  beginVideoRecordingPreparationMock,
  finalizeRecordingStartMock,
  hasActiveVideoRecordingSessionMock,
  isStartCancelledMock,
  isVideoRecordingPreparationInProgressMock,
  loggerLogMock,
  loggerWarnMock,
  notifyRecordingStartFailedMock,
  initializeRecordingContextMock,
  issuePreparedVideoRecordingLeaseMock,
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
  isStartCancelledMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  loggerLogMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  issuePreparedVideoRecordingLeaseMock: vi.fn(),
  runCountdownMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: loggerLogMock, warn: loggerWarnMock }),
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
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { startRecording } from './start';
import {
  defaultSettings,
  ownerSenderUrl,
  recordingContext,
  viewportPreset,
} from './start.test-support';

function resetStartRecordingTestState() {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  initializeRecordingContextMock.mockResolvedValue(recordingContext);
  runCountdownMock.mockResolvedValue(true);
  sendRuntimeMessageMock.mockImplementation((message: { type?: string }) =>
    Promise.resolve(
      message.type === VideoMessageType.OFFSCREEN_STOP_RECORDING
        ? { success: true, result: 'accepted' }
        : undefined
    )
  );
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  isStartCancelledMock.mockReturnValue(false);
  finalizeRecordingStartMock.mockResolvedValue('stream-instance-1');
  issuePreparedVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
}

function startRecordingFromPopup(
  settings = defaultSettings,
  captureMode: CaptureMode = CaptureMode.TAB,
  nextViewportPresetId?: string
) {
  return startRecording(17, settings, captureMode, nextViewportPresetId, ownerSenderUrl);
}

function expectFullStartRollback() {
  expect(setVideoRecordingIdMock).toHaveBeenLastCalledWith(null);
  expect(setOpenEditorAfterRecordingMock).toHaveBeenLastCalledWith(false);
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
}

function verifiesDuplicateStartWhilePreparing() {
  isVideoRecordingPreparationInProgressMock.mockReturnValue(true);
  return startRecordingFromPopup().then(() => {
    expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Ignoring duplicate start while recording initialization is already in progress'
    );
  });
}

function verifiesDuplicateStartWhileActiveRecordingExists() {
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  return startRecordingFromPopup().then(() => {
    expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Ignoring duplicate start while a recording is already active'
    );
  });
}

function verifiesPreparationFailureKeepsPresetIdentity() {
  initializeRecordingContextMock.mockRejectedValue(new Error('mode blocked'));
  return startRecordingFromPopup(defaultSettings, CaptureMode.TAB, viewportPreset.id).then(() => {
    expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
      CaptureMode.TAB,
      expect.objectContaining({ sourceCount: 1 }),
      viewportPreset.id
    );
    expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-1');
    expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('mode blocked', {
      retainAuthority: false,
    });
    expect(runCountdownMock).not.toHaveBeenCalled();
  });
}

function verifiesAbortWhenCaptureSourceCannotBeResolved() {
  initializeRecordingContextMock.mockResolvedValue(null);
  return startRecordingFromPopup().then(() => {
    expect(runCountdownMock).not.toHaveBeenCalled();
    expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
    expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
    expectFullStartRollback();
  });
}

function verifiesAbortWhenCountdownDoesNotComplete() {
  runCountdownMock.mockResolvedValue(false);
  return startRecordingFromPopup().then(() => {
    expect(finalizeRecordingStartMock).toHaveBeenCalledOnce();
    expect(isStartCancelledMock).toHaveBeenCalledWith(17, CaptureMode.TAB);
    expectFullStartRollback();
  });
}

async function verifiesMultiSourceScreenSettingsAndCancellationRollback() {
  runCountdownMock.mockResolvedValue(false);

  await startRecordingFromPopup(
    {
      ...defaultSettings,
      sourceCount: 3,
      systemAudioEnabled: true,
      controlledCursorCaptureEnabled: true,
    },
    CaptureMode.SCREEN
  );

  expect(initializeRecordingContextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        controlledCursorCaptureEnabled: false,
        sourceCount: 3,
        systemAudioEnabled: false,
      }),
    })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
    })
  );
}

function verifiesViewportPresetHappyPath() {
  return startRecordingFromPopup(defaultSettings, CaptureMode.TAB, viewportPreset.id).then(() => {
    const sanitizedSettings = {
      ...defaultSettings,
      sourceCount: 1,
    };
    expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
      CaptureMode.TAB,
      sanitizedSettings,
      viewportPreset.id
    );
    expect(initializeRecordingContextMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.TAB,
      settings: sanitizedSettings,
      tabId: 17,
      viewportPresetId: viewportPreset.id,
    });
    expect(runCountdownMock).toHaveBeenCalledWith(17, CaptureMode.TAB, sanitizedSettings);
    expect(initializeRecordingContextMock.mock.calls[0]?.[0].settings).not.toBe(defaultSettings);
    expect(setOpenEditorAfterRecordingMock).toHaveBeenCalledWith(false);
    expect(isStartCancelledMock).toHaveBeenCalledWith(17, CaptureMode.TAB);
    expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
    expect(finalizeRecordingStartMock).toHaveBeenCalledWith({
      ...recordingContext,
      recordingId: 'recording-1',
      streamInstanceId: 'recording-1',
    });
    expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.TAB,
      cropRegion: null,
      openEditorAfterRecording: false,
      ownerSenderUrl,
      surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
      viewportPresetId: viewportPreset.id,
    });
  });
}

async function verifiesCropGeometryPersistence(): Promise<void> {
  const cropRegion = { x: 120, y: 80, width: 300, height: 300 };
  initializeRecordingContextMock.mockResolvedValue({
    ...recordingContext,
    captureMode: CaptureMode.TAB_CROP,
    captureSource: {
      ...recordingContext.captureSource,
      mode: CaptureMode.TAB_CROP,
      cropRegion,
    },
  });

  await startRecordingFromPopup(defaultSettings, CaptureMode.TAB_CROP, viewportPreset.id);

  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith(
    expect.objectContaining({ captureMode: CaptureMode.TAB_CROP, cropRegion })
  );
}

describe('video-manager start', () => {
  beforeEach(resetStartRecordingTestState);

  it(
    'ignores duplicate starts while preparation is already in progress',
    verifiesDuplicateStartWhilePreparing
  );
  it(
    'ignores duplicate starts while a recording tab is already active',
    verifiesDuplicateStartWhileActiveRecordingExists
  );
  it(
    'reports preparation failures without replacing the selected preset ID',
    verifiesPreparationFailureKeepsPresetIdentity
  );
  it(
    'aborts early when recording context preparation returns null',
    verifiesAbortWhenCaptureSourceCannotBeResolved
  );
  it('aborts cleanly when countdown does not complete', verifiesAbortWhenCountdownDoesNotComplete);
  it(
    'sanitizes multi-source screen settings and disposes prepared streams on cancellation',
    verifiesMultiSourceScreenSettingsAndCancellationRollback
  );
  it(
    'finalizes a viewport preset recording with the assembled context',
    verifiesViewportPresetHappyPath
  );
  it(
    'persists TAB_CROP geometry for worker and navigation recovery',
    verifiesCropGeometryPersistence
  );
});
