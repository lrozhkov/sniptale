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

export const viewportPreset = {
  kind: 'user',
  id: 'wide',
  name: 'Wide',
  target: 'viewport',
  width: 1920,
  height: 1080,
  enabled: true,
  order: 0,
};
export const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

export const recordingContext = {
  tabId: 17,
  captureMode: CaptureMode.TAB,
  captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
  generation: 1,
  viewportPresetId: viewportPreset.id,
  surface: {
    sessionId: 'recording-1',
    leaseId: 'lease-1',
    generation: 1,
    presetId: viewportPreset.id,
    target: 'viewport',
    width: viewportPreset.width,
    height: viewportPreset.height,
  },
  settings: defaultSettings,
};
