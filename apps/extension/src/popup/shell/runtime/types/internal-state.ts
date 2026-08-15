import type { Dispatch, SetStateAction } from 'react';
import type { ViewportPreset } from '../../../../contracts/settings';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../../features/media-hub/storage-capacity';
import type {
  CaptureMode,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneOption } from '../../../recording/microphone';
import type { RefreshMicrophoneDevicesOptions } from '../../../recording/microphone-flow';
import type { WebcamOption } from '../../../recording/webcam';
import type { RefreshWebcamDevicesOptions } from '../../../recording/webcam-flow';
import type { RecordingControlCapability } from '../recording-control-capability';

interface PopupVideoPresetState {
  viewportPresets: ViewportPreset[];
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  selectedPreset: ViewportPreset | null;
  setViewportPresets: Dispatch<SetStateAction<ViewportPreset[]>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
}

interface PopupVideoRecordingState {
  recordingControlCapability: RecordingControlCapability | null;
  videoSettings: VideoRecordingSettings;
  recordingState: VideoRecordingRuntimeState;
  startError: string | null;
  isStartPending: boolean;
  recordingActive: boolean;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
  setRecordingControlCapability: Dispatch<SetStateAction<RecordingControlCapability | null>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  clearStartError: () => void;
}

interface PopupVideoMediaDeviceState {
  microphoneDevices: MicrophoneOption[];
  isLoadingMicrophones: boolean;
  webcamDevices: WebcamOption[];
  isLoadingWebcams: boolean;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  setIsLoadingMicrophones: Dispatch<SetStateAction<boolean>>;
  setIsLoadingWebcams: Dispatch<SetStateAction<boolean>>;
}

interface PopupVideoEnvironmentState {
  activeTabCapabilities: ActiveTabCapabilities;
  galleryStatus: { text: string; pressure: StoragePressureLevel } | null;
  setActiveTabCapabilities: Dispatch<SetStateAction<ActiveTabCapabilities>>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
}

export interface PopupVideoRuntimeStateSlice {
  actions: {
    refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
    refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
  };
  devices: PopupVideoMediaDeviceState;
  environment: PopupVideoEnvironmentState;
  presets: PopupVideoPresetState;
  recording: PopupVideoRecordingState;
}
