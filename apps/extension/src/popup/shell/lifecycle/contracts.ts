import type { Dispatch, SetStateAction } from 'react';

import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../contracts/settings';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type {
  CaptureMode,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';

export type PopupLifecycleParams = {
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
  clearAppliedViewportAuthority: () => void;
  setHomeError: Dispatch<SetStateAction<string | null>>;
  setViewportPresets: Dispatch<SetStateAction<ViewportPreset[]>>;
  setQuickActions: Dispatch<SetStateAction<QuickAction[]>>;
  setQuickActionsReady: Dispatch<SetStateAction<boolean>>;
  setDisplayMode: Dispatch<SetStateAction<QuickActionsDisplayMode>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setRecordingControlCapability: Dispatch<
    SetStateAction<{ controlToken: string; recordingId: string } | null>
  >;
  setRecordingState: Dispatch<SetStateAction<VideoRecordingRuntimeState>>;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
};

export type PopupLifecycleParamsGetter = () => PopupLifecycleParams;

export type PopupLifecycleBootstrapParams = Pick<
  PopupLifecycleParams,
  | 'setHomeError'
  | 'refreshActiveTabCapabilities'
  | 'refreshGalleryStatus'
  | 'setViewportPresets'
  | 'setQuickActions'
  | 'setQuickActionsReady'
  | 'setDisplayMode'
  | 'setVideoSettings'
  | 'setSelectedPresetId'
  | 'setVideoCaptureMode'
  | 'setRecordingControlCapability'
  | 'setRecordingState'
  | 'setMicrophoneDevices'
  | 'setWebcamDevices'
  | 'setIsReady'
  | 'setStartError'
>;

export type PopupLifecycleBootstrapParamsGetter = () => PopupLifecycleBootstrapParams;

type PopupLifecycleBrowserListenerParams = Pick<
  PopupLifecycleParams,
  'clearAppliedViewportAuthority' | 'refreshActiveTabCapabilities' | 'refreshGalleryStatus'
>;

export type PopupLifecycleBrowserListenerParamsGetter = () => PopupLifecycleBrowserListenerParams;

type PopupLifecycleMediaHubParams = Pick<
  PopupLifecycleParams,
  'refreshGalleryStatus' | 'setGalleryStatus'
>;

export type PopupLifecycleMediaHubParamsGetter = () => PopupLifecycleMediaHubParams;
