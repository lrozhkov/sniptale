import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  acknowledgePendingVideoPostRecordResultMock,
  beginVideoRecordingPreparationMock,
  beginPreparedRecordingMock,
  finalizeRecordingStartMock,
  initializeRecordingContextMock,
  createCameraRecorderLaunchGrantMock,
  isVideoRecordingPreparationInProgressMock,
  issueCameraRecorderLaunchTokenMock,
  issuePreparedVideoRecordingLeaseMock,
  readStoredVideoPostRecordResultMock,
  runCountdownMock,
  scheduleRecordingStartActivationWatchdogMock,
  sendRuntimeMessageMock,
  openCompanionMock,
  setVideoRecordingIdMock,
} = vi.hoisted(() => ({
  acknowledgePendingVideoPostRecordResultMock: vi.fn(),
  beginVideoRecordingPreparationMock: vi.fn(),
  beginPreparedRecordingMock: vi.fn(),
  finalizeRecordingStartMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  createCameraRecorderLaunchGrantMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  issueCameraRecorderLaunchTokenMock: vi.fn(),
  issuePreparedVideoRecordingLeaseMock: vi.fn(),
  readStoredVideoPostRecordResultMock: vi.fn(),
  runCountdownMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  openCompanionMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage: openCompanionMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  beginVideoRecordingPreparation: beginVideoRecordingPreparationMock,
  hasActiveVideoRecordingSession: vi.fn(() => false),
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  finalizeRecordingStart: finalizeRecordingStartMock,
  beginPreparedRecording: beginPreparedRecordingMock,
  isStartCancelled: vi.fn(() => false),
  runCountdown: runCountdownMock,
}));
vi.mock('./recording-context.prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-context.prepare')>()),
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
vi.mock('../runtime/camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/camera-recorder-control')>()),
  issueCameraRecorderLaunchToken: issueCameraRecorderLaunchTokenMock,
}));
vi.mock('../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/post-record-result')>()),
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));
vi.mock('../../../storage/video/post-record-acknowledgement', () => ({
  acknowledgePendingVideoPostRecordResult: acknowledgePendingVideoPostRecordResultMock,
}));
vi.mock('../../../storage/video/camera-recorder-grant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/camera-recorder-grant')>()),
  createCameraRecorderLaunchGrant: createCameraRecorderLaunchGrantMock,
}));

import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from './start';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const defaultSettings: VideoRecordingSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 1500,
  controlledCursorCaptureEnabled: true,
  countdownSeconds: 3,
  interactionDiagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
  systemAudioEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  beginVideoRecordingPreparationMock.mockReset();
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  acknowledgePendingVideoPostRecordResultMock.mockReset().mockResolvedValue('acknowledged');
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  runCountdownMock.mockResolvedValue(true);
  beginPreparedRecordingMock.mockResolvedValue(undefined);
  finalizeRecordingStartMock.mockResolvedValue('camera-stream-instance-1');
  issuePreparedVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
  readStoredVideoPostRecordResultMock.mockReset().mockResolvedValue(null);
  issueCameraRecorderLaunchTokenMock.mockResolvedValue('recording-1');
  openCompanionMock.mockResolvedValue(undefined);
});

it('preserves the admitted camera launch when a duplicate saved-result acknowledgement finishes late', async () => {
  const { issueCameraRecorderLaunchToken } = await vi.importActual<
    typeof import('../runtime/camera-recorder-control')
  >('../runtime/camera-recorder-control');
  const previous = {
    status: 'ready',
    result: {
      recordingId: 'previous-recording',
      primaryRecordingId: 'previous-recording',
      projectId: null,
    },
  };
  readStoredVideoPostRecordResultMock
    .mockResolvedValueOnce(previous)
    .mockResolvedValueOnce(previous);
  let releaseDuplicate!: () => void;
  const duplicateGate = new Promise<void>((resolve) => {
    releaseDuplicate = resolve;
  });
  acknowledgePendingVideoPostRecordResultMock
    .mockResolvedValueOnce('acknowledged')
    .mockImplementationOnce(async () => {
      await duplicateGate;
      return 'acknowledged';
    });
  let signalGrantStarted!: () => void;
  const grantStarted = new Promise<void>((resolve) => {
    signalGrantStarted = resolve;
  });
  let releaseGrant!: () => void;
  const grantGate = new Promise<void>((resolve) => {
    releaseGrant = resolve;
  });
  createCameraRecorderLaunchGrantMock.mockImplementationOnce(
    async (recordingId, registrationToken) => {
      signalGrantStarted();
      await grantGate;
      return {
        documentId: '',
        expiresAt: Date.now() + 60000,
        previousRegistrationToken: null,
        registrationToken,
        recordingId,
        senderUrl: '',
        stage: 'launch',
        tabId: null,
      };
    }
  );
  issueCameraRecorderLaunchTokenMock.mockImplementationOnce(issueCameraRecorderLaunchToken);
  beginVideoRecordingPreparationMock.mockImplementation(() =>
    isVideoRecordingPreparationInProgressMock.mockReturnValue(true)
  );
  initializeRecordingContextMock.mockResolvedValue({
    captureMode: CaptureMode.CAMERA,
    captureSource: { cameraDeviceId: 'camera-1', mode: CaptureMode.CAMERA, streamId: 'camera' },
    generation: 1,
    settings: defaultSettings,
    surface: null,
    tabId: null,
    viewportPresetId: null,
  });
  const winner = startRecording(
    undefined,
    defaultSettings,
    CaptureMode.CAMERA,
    null,
    ownerSenderUrl
  );
  const duplicate = startRecording(
    undefined,
    defaultSettings,
    CaptureMode.CAMERA,
    null,
    ownerSenderUrl
  );
  await grantStarted;
  expect(acknowledgePendingVideoPostRecordResultMock).toHaveBeenCalledTimes(2);
  releaseDuplicate();
  await expect(duplicate).resolves.toEqual({ result: 'duplicate-preparing' });
  releaseGrant();
  await expect(winner).resolves.toMatchObject({
    result: 'accepted',
    recordingId: 'recording-1',
    cameraLaunchToken: 'recording-1',
  });
  expect(beginVideoRecordingPreparationMock).toHaveBeenCalledOnce();
  expect(createCameraRecorderLaunchGrantMock).toHaveBeenCalledOnce();
});

it('finalizes a camera recording with a launch token and control capability', async () => {
  const cameraSettings = {
    ...defaultSettings,
    controlledCursorCaptureEnabled: false,
    interactionDiagnosticsEnabled: false,
    sourceCount: 1,
    systemAudioEnabled: false,
    webcamEnabled: true,
  };
  initializeRecordingContextMock.mockResolvedValue({
    captureMode: CaptureMode.CAMERA,
    captureSource: { cameraDeviceId: 'camera-1', mode: CaptureMode.CAMERA, streamId: 'camera' },
    generation: 1,
    settings: cameraSettings,
    surface: null,
    tabId: null,
    viewportPresetId: null,
  });

  await expect(
    startRecording(undefined, defaultSettings, CaptureMode.CAMERA, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    cameraLaunchToken: 'recording-1',
    cameraRecorderOpened: true,
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
  });

  expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
    CaptureMode.CAMERA,
    cameraSettings,
    null
  );
  expect(runCountdownMock).toHaveBeenCalledWith(null, CaptureMode.CAMERA, cameraSettings);
  expect(openCompanionMock).toHaveBeenCalledWith({
    launchToken: 'recording-1',
    recordingId: 'recording-1',
  });
  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.CAMERA,
    cropRegion: null,
    ownerSenderUrl,
    surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
    viewportPresetId: null,
  });
  expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
  expect(beginPreparedRecordingMock).toHaveBeenCalledWith({
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'recording-1',
  });
});
