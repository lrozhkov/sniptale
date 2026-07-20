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
  normalizeViewportPresetMock,
  initializeRecordingContextMock,
  issueActiveVideoRecordingLeaseMock,
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
  normalizeViewportPresetMock: vi.fn((captureMode, viewportPreset) =>
    captureMode === 'VIEWPORT_EMULATION' ? viewportPreset : undefined
  ),
  initializeRecordingContextMock: vi.fn(),
  issueActiveVideoRecordingLeaseMock: vi.fn(),
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
vi.mock('./recording-context', () => ({
  normalizeViewportPreset: normalizeViewportPresetMock,
  initializeRecordingContext: initializeRecordingContextMock,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: scheduleRecordingStartActivationWatchdogMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  issueActiveVideoRecordingLease: issueActiveVideoRecordingLeaseMock,
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
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  isStartCancelledMock.mockReturnValue(false);
  finalizeRecordingStartMock.mockResolvedValue(undefined);
  issueActiveVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
}

function startRecordingFromPopup(
  settings = defaultSettings,
  captureMode: CaptureMode = CaptureMode.TAB,
  nextViewportPreset?: typeof viewportPreset
) {
  return startRecording(17, settings, captureMode, nextViewportPreset, ownerSenderUrl);
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

function verifiesPreparationFailureAndPresetNormalization() {
  initializeRecordingContextMock.mockRejectedValue(new Error('mode blocked'));
  return startRecordingFromPopup(defaultSettings, CaptureMode.TAB, viewportPreset).then(() => {
    expect(normalizeViewportPresetMock).toHaveBeenCalledWith(CaptureMode.TAB, viewportPreset);
    expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
      CaptureMode.TAB,
      expect.objectContaining({ sourceCount: 1 }),
      undefined
    );
    expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-1');
    expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('mode blocked');
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
    expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
    expect(isStartCancelledMock).not.toHaveBeenCalled();
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

function verifiesViewportEmulationHappyPath() {
  return startRecordingFromPopup(
    defaultSettings,
    CaptureMode.VIEWPORT_EMULATION,
    viewportPreset
  ).then(() => {
    const sanitizedSettings = {
      ...defaultSettings,
      sourceCount: 1,
    };
    expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
      CaptureMode.VIEWPORT_EMULATION,
      sanitizedSettings,
      viewportPreset
    );
    expect(initializeRecordingContextMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      settings: sanitizedSettings,
      tabId: 17,
      viewportPreset,
    });
    expect(runCountdownMock).toHaveBeenCalledWith(
      17,
      CaptureMode.VIEWPORT_EMULATION,
      sanitizedSettings
    );
    expect(initializeRecordingContextMock.mock.calls[0]?.[0].settings).not.toBe(defaultSettings);
    expect(setOpenEditorAfterRecordingMock).toHaveBeenCalledWith(false);
    expect(isStartCancelledMock).toHaveBeenCalledWith(17, CaptureMode.VIEWPORT_EMULATION);
    expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
    expect(finalizeRecordingStartMock).toHaveBeenCalledWith({
      ...recordingContext,
      onBeforeOffscreenStartDispatch: expect.any(Function),
      shouldAbortBeforeOffscreenStart: expect.any(Function),
    });
  });
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
    'reports preparation failures and drops viewport presets outside viewport emulation',
    verifiesPreparationFailureAndPresetNormalization
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
    'finalizes a viewport emulation recording with the assembled context',
    verifiesViewportEmulationHappyPath
  );
});
