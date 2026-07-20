import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export const defaultSettings: VideoRecordingSettings = {
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

export const viewportPreset = { id: 'wide', label: 'Wide', width: 1920, height: 1080 };
export const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

export const recordingContext = {
  tabId: 17,
  captureMode: CaptureMode.VIEWPORT_EMULATION,
  captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
  viewport: { width: 1920, height: 1080 },
  viewportEmulationResult: { cssWidth: 1280, cssHeight: 720, scale: 0.66 },
  viewportPreset,
  settings: defaultSettings,
};
