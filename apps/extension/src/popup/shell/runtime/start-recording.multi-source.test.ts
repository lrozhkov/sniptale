import { beforeEach, expect, it, vi } from 'vitest';

import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';

vi.mock('../../recording/microphone', (_importOriginal) => ({
  requestMicrophonePermission: vi.fn(),
}));

vi.mock('../../recording/webcam', (_importOriginal) => ({
  requestWebcamPermission: vi.fn(),
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
  webcamDeviceId: null,
  webcamEnabled: false,
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

it('disables system audio for multi-source screen recording', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.SCREEN,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, sourceCount: 2 },
    viewportPreset: null,
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
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: {
      ...defaultSettings,
      sourceCount: 2,
      webcamEnabled: true,
      webcamDeviceId: 'cam-1',
    },
    viewportPreset: null,
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
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, sourceCount: 3 },
    viewportPreset: null,
  });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ sourceCount: 1, systemAudioEnabled: true }),
    })
  );
});
