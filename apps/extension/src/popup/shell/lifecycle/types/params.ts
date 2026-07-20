import type { Dispatch, SetStateAction } from 'react';

import type { StoragePressureLevel } from '../../../../features/media-hub/storage-capacity';
import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../../contracts/settings';
import type {
  CaptureMode,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneOption } from '../../../recording/microphone';
import type { WebcamOption } from '../../../recording/webcam';

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
