import type { Dispatch, SetStateAction } from 'react';

import type { QuickAction, ViewportPreset } from '../../../contracts/settings';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type {
  CaptureMode,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupPage } from '../navigation/actions';
import type { ScreenshotSetupMode } from '../../../composition/persistence/capture-settings';
import type { ScreenshotSetupState } from '../../../composition/persistence/capture-settings';
import type { PopupNavigationResult, PopupNavigationSource } from '../runtime/types/navigation';

export type PopupLifecycleBootstrapParams = {
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
  setHomeError: Dispatch<SetStateAction<string | null>>;
  navigateToPage: (
    page: PopupPage,
    source?: PopupNavigationSource
  ) => Promise<PopupNavigationResult>;
  setViewportPresets: Dispatch<SetStateAction<ViewportPreset[]>>;
  setQuickActions: Dispatch<SetStateAction<QuickAction[]>>;
  setQuickActionsReady: Dispatch<SetStateAction<boolean>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setScreenshotStartupMode: Dispatch<SetStateAction<ScreenshotSetupMode | null>>;
  setInitialScreenshotSetupState: Dispatch<SetStateAction<ScreenshotSetupState>>;
  setRecordingControlCapability: Dispatch<
    SetStateAction<{ controlToken: string; recordingId: string } | null>
  >;
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
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
