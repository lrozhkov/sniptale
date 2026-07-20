import type { PopupLifecycleParams } from './params';

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
