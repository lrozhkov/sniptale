import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export function createSelectedPreset() {
  return { id: 'preset-1', label: 'Preset', width: 1280, height: 720 };
}

export function createActiveTabCapabilities() {
  return {
    export: { supported: true, reason: null },
    isRestrictedPage: false,
    quickActions: { supported: true, reason: null },
    restrictedPageLabel: null,
    screenshotMode: { supported: true, reason: null },
    tabId: 1,
    title: 'Example',
    url: 'https://example.com',
    videoByMode: {
      [CaptureMode.TAB]: { supported: true, reason: null },
      [CaptureMode.TAB_CROP]: { supported: true, reason: null },
      [CaptureMode.CAMERA]: { supported: true, reason: null },
      [CaptureMode.SCREEN]: { supported: true, reason: null },
      [CaptureMode.VIEWPORT_EMULATION]: { supported: true, reason: null },
    },
  };
}

export function createBodySettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 2,
    countdownSeconds: 3,
    diagnosticsEnabled: true,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
  };
}

export function createBodyViewModel(selectedPreset: ReturnType<typeof createSelectedPreset>) {
  return {
    canStart: true,
    controlledCursorDisabled: true,
    controlledCursorDisabledReason: 'Desktop app required',
    currentModeCapability: { supported: true, reason: null },
    diagnosticsDisabled: false,
    galleryTitle: 'Gallery title',
    selectedPreset,
    startButtonLabel: 'Start recording',
    startDisabledReason: null,
    systemAudioDisabled: true,
  };
}
