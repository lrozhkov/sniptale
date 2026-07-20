import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../../features/media-hub/storage-capacity';
import type { ViewportPreset } from '../../../../contracts/settings';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

interface GalleryStatus {
  text: string;
  pressure: StoragePressureLevel;
}

export interface VideoSetupPageProps {
  settings: VideoRecordingSettings;
  captureMode: CaptureMode;
  selectedPresetId: string | null;
  appliedViewportPresetId: string | null;
  appliedViewportTabId: number | null;
  viewportPresets: ViewportPreset[];
  microphoneDevices: Array<{ deviceId: string; label: string }>;
  isLoadingMicrophones: boolean;
  webcamDevices: Array<{ deviceId: string; label: string }>;
  isLoadingWebcams: boolean;
  startError: string | null;
  isStartPending: boolean;
  pageAccessDisabledReason?: string | null;
  activeTabCapabilities: ActiveTabCapabilities;
  onCaptureModeChange: (mode: CaptureMode) => void;
  onPresetChange: (presetId: string | null) => Promise<void> | void;
  onMicrophoneDeviceChange: (microphoneDeviceId: string | null) => void;
  onToggleMicrophone: () => void;
  onWebcamDeviceChange: (webcamDeviceId: string | null) => void;
  onToggleWebcam: () => void;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  activeRecordingId: string | null;
  recordingState: VideoRecordingRuntimeState;
  galleryStatus: GalleryStatus | null;
}

export interface VideoSetupViewModel {
  selectedPreset: ViewportPreset | null;
  currentModeCapability: ActiveTabCapabilities['videoByMode'][CaptureMode];
  modeCapabilities?: ActiveTabCapabilities['videoByMode'];
  startDisabledReason: string | null;
  canStart: boolean;
  systemAudioDisabled: boolean;
  diagnosticsDisabled: boolean;
  controlledCursorDisabled: boolean;
  controlledCursorDisabledReason: string | null;
  startButtonLabel: string;
  galleryTitle: string;
}
