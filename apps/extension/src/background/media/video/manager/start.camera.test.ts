import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingPreparationMock,
  finalizeRecordingStartMock,
  initializeRecordingContextMock,
  issueActiveVideoRecordingLeaseMock,
  runCountdownMock,
  scheduleRecordingStartActivationWatchdogMock,
  sendRuntimeMessageMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
} = vi.hoisted(() => ({
  beginVideoRecordingPreparationMock: vi.fn(),
  finalizeRecordingStartMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  issueActiveVideoRecordingLeaseMock: vi.fn(),
  runCountdownMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  beginVideoRecordingPreparation: beginVideoRecordingPreparationMock,
  hasActiveVideoRecordingSession: vi.fn(() => false),
  isVideoRecordingPreparationInProgress: vi.fn(() => false),
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  finalizeRecordingStart: finalizeRecordingStartMock,
  isStartCancelled: vi.fn(() => false),
  runCountdown: runCountdownMock,
}));
vi.mock('./recording-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-context')>()),
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

import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from './start';

const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const defaultSettings: VideoRecordingSettings = {
  autoFadeDelay: 1500,
  controlledCursorCaptureEnabled: true,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  systemAudioEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  runCountdownMock.mockResolvedValue(true);
  finalizeRecordingStartMock.mockResolvedValue(undefined);
  issueActiveVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
});

it('finalizes a camera recording with a launch token and control capability', async () => {
  const cameraSettings = {
    ...defaultSettings,
    controlledCursorCaptureEnabled: false,
    diagnosticsEnabled: false,
    sourceCount: 1,
    systemAudioEnabled: false,
    webcamEnabled: true,
  };
  initializeRecordingContextMock.mockResolvedValue({
    captureMode: CaptureMode.CAMERA,
    captureSource: { cameraDeviceId: 'camera-1', mode: CaptureMode.CAMERA, streamId: 'camera' },
    settings: cameraSettings,
    tabId: null,
  });

  await expect(
    startRecording(undefined, defaultSettings, CaptureMode.CAMERA, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    cameraLaunchToken: 'recording-1',
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
  });

  expect(beginVideoRecordingPreparationMock).toHaveBeenCalledWith(
    CaptureMode.CAMERA,
    cameraSettings,
    undefined
  );
  expect(runCountdownMock).toHaveBeenCalledWith(null, CaptureMode.CAMERA, cameraSettings);
  expect(issueActiveVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.CAMERA,
    ownerSenderUrl,
    openEditorAfterRecording: false,
  });
  expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
});
