import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { requestWebcamPermission } = vi.hoisted(() => ({
  requestWebcamPermission: vi.fn(),
}));

vi.mock('../../recording/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/microphone')>()),
  requestMicrophonePermission: vi.fn(),
}));

vi.mock('../../recording/webcam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/webcam')>()),
  requestWebcamPermission,
}));

const runtimeSendMessage = vi.fn();
const tabsQuery = vi.fn();
const setIsStartPending = vi.fn();
const setRecordingControlCapability = vi.fn();
const setStartError = vi.fn();

const defaultSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 3,
  controlledCursorCaptureEnabled: false,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  webcamDeviceId: 'cam-1',
  webcamEnabled: true,
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
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: defaultSettings,
    viewportPresetId: null,
    webcamDevices: [{ deviceId: 'cam-1', label: 'Camera 1' }],
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

it('uses an available webcam for this start without rewriting the saved preference', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, webcamDeviceId: 'camera-currently-missing' },
    viewportPresetId: null,
    webcamDevices: [{ deviceId: 'cam-available', label: 'Available camera' }],
  });

  expect(requestWebcamPermission).toHaveBeenCalledWith('cam-available');
  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ webcamDeviceId: 'cam-available' }),
    })
  );
  expect(defaultSettings.webcamDeviceId).toBe('cam-1');
});

it('does not send START_RECORDING when webcam permission fails', async () => {
  requestWebcamPermission.mockRejectedValueOnce(new Error('camera blocked'));

  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: defaultSettings,
    viewportPresetId: null,
    webcamDevices: [{ deviceId: 'cam-1', label: 'Camera 1' }],
  });

  expect(requestWebcamPermission).toHaveBeenCalledWith('cam-1');
  expect(runtimeSendMessage).not.toHaveBeenCalled();
  expect(setStartError).toHaveBeenCalledWith('camera blocked');
});
