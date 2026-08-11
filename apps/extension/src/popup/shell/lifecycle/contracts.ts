import type { Dispatch, SetStateAction } from 'react';

import type { QuickAction, ViewportPreset } from '../../../contracts/settings';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type {
  CaptureMode,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';
import type { PopupPage } from '../navigation/actions';
import type { ScreenshotSetupMode } from '../../../composition/persistence/capture-settings';

export type PopupLifecycleBootstrapParams = {
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
  setHomeError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<PopupPage>>;
  setViewportPresets: Dispatch<SetStateAction<ViewportPreset[]>>;
  setQuickActions: Dispatch<SetStateAction<QuickAction[]>>;
  setQuickActionsReady: Dispatch<SetStateAction<boolean>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setScreenshotStartupMode: Dispatch<SetStateAction<ScreenshotSetupMode | null>>;
  setRecordingControlCapability: Dispatch<
    SetStateAction<{ controlToken: string; recordingId: string } | null>
  >;
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
};

export type PopupLifecycleBootstrapParamsGetter = () => PopupLifecycleBootstrapParams;

type PopupLifecycleBrowserListenerParams = {
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
};

export type PopupLifecycleBrowserListenerParamsGetter = () => PopupLifecycleBrowserListenerParams;

type PopupLifecycleMediaHubParams = {
  refreshGalleryStatus: () => Promise<void>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
};

export type PopupLifecycleMediaHubParamsGetter = () => PopupLifecycleMediaHubParams;

type PopupLifecycleRecordingParams = {
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
};

export type PopupLifecycleParams = {
  bootstrap: PopupLifecycleBootstrapParams;
  browser: PopupLifecycleBrowserListenerParams;
  mediaHub: PopupLifecycleMediaHubParams;
  recording: PopupLifecycleRecordingParams;
};

export type PopupLifecycleParamsGetter = () => PopupLifecycleParams;
