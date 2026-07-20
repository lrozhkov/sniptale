import {
  CaptureMode,
  VideoQuality,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';

export function createPopupBootstrapSettings(overrides: Record<string, unknown> = {}) {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: 'preset-2',
    imageFormat: 'png',
    imageQuality: 92,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [
      { height: 720, id: 'preset-1', label: 'Compact', width: 1280 },
      { height: 1080, id: 'preset-2', label: 'Full HD', width: 1920 },
    ],
    ...overrides,
  };
}

export function createPopupBootstrapVideoSettings(overrides: Record<string, unknown> = {}) {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'missing-device',
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
    ...overrides,
  };
}

export function createPopupBootstrapVideoUiState(overrides: Record<string, unknown> = {}) {
  return {
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    viewportPresetId: 'missing-preset',
    ...overrides,
  };
}

export function createPopupBootstrapRecordingState(status = VideoRecordingStatus.RECORDING) {
  return {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 12,
    error: null,
    status,
    viewportPreset: null,
  };
}
