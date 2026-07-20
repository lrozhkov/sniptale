import { beforeEach, expect, it, vi } from 'vitest';

import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';

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

const settings = {
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
  runtimeSendMessage.mockResolvedValue({
    success: true,
    result: 'accepted',
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  });
  Object.assign(globalThis, {
    chrome: {
      runtime: { sendMessage: runtimeSendMessage },
      tabs: { query: tabsQuery },
    },
  });
});

it('stores the background-issued recording control capability after accepted start', async () => {
  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: settings,
    viewportPreset: null,
  });

  expect(setRecordingControlCapability).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
});

it('clears stale recording control capability after non-accepted start', async () => {
  runtimeSendMessage.mockResolvedValueOnce({ success: true, result: 'cancelled' });

  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: settings,
    viewportPreset: null,
  });

  expect(setRecordingControlCapability).toHaveBeenCalledWith(null);
});
