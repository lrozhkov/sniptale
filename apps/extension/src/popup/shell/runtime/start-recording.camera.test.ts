import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';

const { openCameraRecorderPage, requestMicrophonePermission, requestWebcamPermission } = vi.hoisted(
  () => ({
    openCameraRecorderPage: vi.fn(),
    requestMicrophonePermission: vi.fn(),
    requestWebcamPermission: vi.fn(),
  })
);

vi.mock('../../recording/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/microphone')>()),
  requestMicrophonePermission,
}));
vi.mock('../../recording/webcam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/webcam')>()),
  requestWebcamPermission,
}));
vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage,
}));

const defaultSettings = {
  autoFadeDelay: 3,
  controlledCursorCaptureEnabled: true,
  countdownSeconds: 3,
  diagnosticsEnabled: true,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  sourceCount: 3,
  systemAudioEnabled: true,
  webcamDeviceId: 'cam-1',
  webcamEnabled: false,
};

const setIsStartPending = vi.fn();
const setRecordingControlCapability = vi.fn();
const setStartError = vi.fn();
const tabsQuery = vi.fn();
const runtimeSendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  runtimeSendMessage.mockResolvedValue({
    cameraLaunchToken: 'launch-token-1',
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
    success: true,
  });
  openCameraRecorderPage.mockResolvedValue(undefined);
  Object.assign(globalThis, {
    chrome: {
      runtime: { sendMessage: runtimeSendMessage },
      tabs: { query: tabsQuery },
    },
  });
});

describe('startRecordingHandler camera mode', () => {
  it('starts camera recording without active tab resolution', async () => {
    await startRecordingHandler({
      captureMode: CaptureMode.CAMERA,
      setIsStartPending,
      setRecordingControlCapability,
      setStartError,
      videoSettings: defaultSettings,
      viewportPreset: null,
    });

    expect(tabsQuery).not.toHaveBeenCalled();
    expect(requestWebcamPermission).toHaveBeenCalledWith('cam-1');
    expect(runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: CaptureMode.CAMERA,
        settings: expect.objectContaining({
          controlledCursorCaptureEnabled: false,
          diagnosticsEnabled: false,
          sourceCount: 1,
          systemAudioEnabled: false,
          webcamDeviceId: 'cam-1',
          webcamEnabled: true,
        }),
        type: VideoMessageType.START_RECORDING,
      })
    );
    expect(openCameraRecorderPage).toHaveBeenCalledWith({
      launchToken: 'launch-token-1',
      recordingId: 'recording-1',
    });
  });
});
