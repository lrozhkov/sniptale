import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

export const defaultSettings: VideoRecordingSettings = {
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

export const viewportPreset = {
  kind: 'user',
  id: 'wide',
  name: 'Wide',
  target: 'window',
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
    target: 'window',
    width: viewportPreset.width,
    height: viewportPreset.height,
  },
  settings: defaultSettings,
};
