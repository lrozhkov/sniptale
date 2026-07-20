import type { Dispatch, SetStateAction } from 'react';

import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../../contracts/settings';
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
import type { PopupPage } from '../../navigation/actions';
import type { RecordingControlCapability } from '../recording-control-capability';

interface PopupRuntimeSessionState {
  homeError: string | null;
  isReady: boolean;
  page: PopupPage;
  setHomeError: Dispatch<SetStateAction<string | null>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  setPage: Dispatch<SetStateAction<PopupPage>>;
}

interface PopupRuntimePresetState {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  displayMode: QuickActionsDisplayMode;
  viewportPresets: ViewportPreset[];
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  selectedPreset: ViewportPreset | null;
  appliedViewportPresetId: string | null;
  appliedViewportTabId: number | null;
  setQuickActions: Dispatch<SetStateAction<QuickAction[]>>;
  setQuickActionsReady: Dispatch<SetStateAction<boolean>>;
  setDisplayMode: Dispatch<SetStateAction<QuickActionsDisplayMode>>;
  setViewportPresets: Dispatch<SetStateAction<ViewportPreset[]>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setAppliedViewportPresetId: Dispatch<SetStateAction<string | null>>;
  setAppliedViewportTabId: Dispatch<SetStateAction<number | null>>;
}

interface PopupRuntimeRecordingState {
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

interface PopupRuntimeMediaDeviceState {
  microphoneDevices: MicrophoneOption[];
  isLoadingMicrophones: boolean;
  webcamDevices: WebcamOption[];
  isLoadingWebcams: boolean;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  setIsLoadingMicrophones: Dispatch<SetStateAction<boolean>>;
  setIsLoadingWebcams: Dispatch<SetStateAction<boolean>>;
}

interface PopupRuntimeEnvironmentState {
  activeTabCapabilities: ActiveTabCapabilities;
  galleryStatus: { text: string; pressure: StoragePressureLevel } | null;
  setActiveTabCapabilities: Dispatch<SetStateAction<ActiveTabCapabilities>>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
}

export interface PopupRuntimeDerivedState {
  showFooter: boolean;
}

export interface PopupRuntimeRefreshActions {
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
  refreshGalleryStatus: () => Promise<void>;
  refreshActiveTabCapabilities: () => Promise<void>;
}

export interface PopupRuntimeCoreState {
  session: PopupRuntimeSessionState;
  presets: Omit<PopupRuntimePresetState, 'selectedPreset'>;
  recording: Omit<PopupRuntimeRecordingState, 'recordingActive'>;
  devices: PopupRuntimeMediaDeviceState;
  environment: PopupRuntimeEnvironmentState;
}

export interface PopupRuntimeStateSlice {
  session: PopupRuntimeSessionState;
  presets: PopupRuntimePresetState;
  recording: PopupRuntimeRecordingState;
  devices: PopupRuntimeMediaDeviceState;
  environment: PopupRuntimeEnvironmentState;
  actions: PopupRuntimeRefreshActions;
  derived: PopupRuntimeDerivedState;
}
