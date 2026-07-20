import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';

const { requestWebcamPermission } = vi.hoisted(() => ({
  requestWebcamPermission: vi.fn(),
}));

vi.mock('../../recording/microphone', (_importOriginal) => ({
  requestMicrophonePermission: vi.fn(),
}));

vi.mock('../../recording/webcam', (_importOriginal) => ({
  requestWebcamPermission,
}));

const runtimeSendMessage = vi.fn();
const tabsQuery = vi.fn();
const setIsStartPending = vi.fn();
const setRecordingControlCapability = vi.fn();
const setStartError = vi.fn();

const defaultSettings = {
  autoFadeDelay: 3,
  controlledCursorCaptureEnabled: false,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  webcamDeviceId: 'cam-1',
  webcamEnabled: true,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  systemAudioEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  tabsQuery.mockResolvedValue([{ id: 123 }]);
  runtimeSendMessage.mockResolvedValue({ success: true });
  Object.assign(globalThis, {
    chrome: {
      runtime: { sendMessage: runtimeSendMessage },
      tabs: { query: tabsQuery },
    },
  });
});

it('requests webcam permission and carries webcam settings into START_RECORDING', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: defaultSettings,
    viewportPreset: null,
  });

  expect(requestWebcamPermission).toHaveBeenCalledWith('cam-1');
  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.START_RECORDING,
      settings: expect.objectContaining({
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
      }),
    })
  );
});

it('does not send START_RECORDING when webcam permission fails', async () => {
  requestWebcamPermission.mockRejectedValueOnce(new Error('camera blocked'));

  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: defaultSettings,
    viewportPreset: null,
  });

  expect(requestWebcamPermission).toHaveBeenCalledWith('cam-1');
  expect(runtimeSendMessage).not.toHaveBeenCalled();
  expect(setStartError).toHaveBeenCalledWith('camera blocked');
});
