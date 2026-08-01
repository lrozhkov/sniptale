import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ViewportPreset } from '../../../../contracts/settings';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

export function createSelectedPreset(): ViewportPreset {
  return {
    kind: 'user',
    id: 'preset-1',
    name: 'Preset',
    target: 'viewport',
    width: 1280,
    height: 720,
    enabled: true,
    order: 0,
  };
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
    },
  };
}

export function createBodySettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 2,
    countdownSeconds: 3,
    diagnosticsEnabled: true,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.MEDIUM },
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
    knownOutputBasisDimensions: { height: selectedPreset.height, width: selectedPreset.width },
    selectedPreset,
    startButtonLabel: 'Start recording',
    startDisabledReason: null,
    systemAudioDisabled: true,
  };
}
