import { beforeEach, expect, it, vi } from 'vitest';

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

vi.mock('../../recording/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/microphone')>()),
  requestMicrophonePermission: vi.fn(),
}));

vi.mock('../../recording/webcam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/webcam')>()),
  requestWebcamPermission: vi.fn(),
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
  webcamDeviceId: null,
  webcamEnabled: false,
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

it('disables system audio for multi-source screen recording', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.SCREEN,
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, sourceCount: 2 },
    viewportPresetId: null,
    webcamDevices: [],
  });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ sourceCount: 2, systemAudioEnabled: false }),
    })
  );
});

it('does not disable webcam for multi-source screen recording', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.SCREEN,
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: {
      ...defaultSettings,
      sourceCount: 2,
      webcamEnabled: true,
      webcamDeviceId: 'cam-1',
    },
    viewportPresetId: null,
    webcamDevices: [{ deviceId: 'cam-1', label: 'Camera 1' }],
  });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        sourceCount: 2,
        systemAudioEnabled: false,
        webcamEnabled: true,
        webcamDeviceId: 'cam-1',
      }),
    })
  );
});

it('resets source count outside screen capture mode', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    microphoneDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, sourceCount: 3 },
    viewportPresetId: null,
    webcamDevices: [],
  });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ sourceCount: 1, systemAudioEnabled: true }),
    })
  );
});
