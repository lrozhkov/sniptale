import { vi } from 'vitest';

import type {
  ActiveTabCapabilities,
  CapabilityState,
} from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupRuntimeStateSlice } from '../state';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

export type PopupRuntimeStateSliceOverrides = Partial<
  PopupRuntimeStateSlice['actions'] &
    PopupRuntimeStateSlice['derived'] &
    PopupRuntimeStateSlice['devices'] &
    PopupRuntimeStateSlice['environment'] &
    PopupRuntimeStateSlice['presets'] &
    PopupRuntimeStateSlice['recording'] &
    PopupRuntimeStateSlice['session']
>;

export function createRuntimeRecordingState(
  status: VideoRecordingStatus
): VideoRecordingRuntimeState {
  return {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status,
    viewportPresetId: null,
  };
}

export function createPopupRuntimeStateSlice(
  overrides: PopupRuntimeStateSliceOverrides = {}
): PopupRuntimeStateSlice {
  return {
    actions: createRuntimeActions(overrides),
    derived: { showFooter: overrides.showFooter ?? true },
    devices: createRuntimeDevices(overrides),
    environment: createRuntimeEnvironment(overrides),
    presets: createRuntimePresets(overrides),
    recording: createRuntimeRecording(overrides),
    session: createRuntimeSession(overrides),
  };
}

function createRuntimeActions(overrides: PopupRuntimeStateSliceOverrides) {
  return {
    refreshActiveTabCapabilities: overrides.refreshActiveTabCapabilities ?? vi.fn(),
    refreshGalleryStatus: overrides.refreshGalleryStatus ?? vi.fn(),
    refreshMicrophones: overrides.refreshMicrophones ?? vi.fn(async () => []),
    refreshWebcams: overrides.refreshWebcams ?? vi.fn(async () => []),
  };
}

function createRuntimeDevices(overrides: PopupRuntimeStateSliceOverrides) {
  return {
    isLoadingMicrophones: overrides.isLoadingMicrophones ?? false,
    isLoadingWebcams: overrides.isLoadingWebcams ?? false,
    microphoneDevices: overrides.microphoneDevices ?? [],
    setIsLoadingMicrophones: overrides.setIsLoadingMicrophones ?? vi.fn(),
    setIsLoadingWebcams: overrides.setIsLoadingWebcams ?? vi.fn(),
    setMicrophoneDevices: overrides.setMicrophoneDevices ?? vi.fn(),
    setWebcamDevices: overrides.setWebcamDevices ?? vi.fn(),
    webcamDevices: overrides.webcamDevices ?? [],
  };
}

function createRuntimeEnvironment(
  overrides: PopupRuntimeStateSliceOverrides
): PopupRuntimeStateSlice['environment'] {
  return {
    activeTabCapabilities: overrides.activeTabCapabilities ?? createActiveTabCapabilities(),
    galleryStatus: overrides.galleryStatus ?? null,
    setActiveTabCapabilities: overrides.setActiveTabCapabilities ?? vi.fn(),
    setGalleryStatus: overrides.setGalleryStatus ?? vi.fn(),
  };
}

function createActiveTabCapabilities(): ActiveTabCapabilities {
  const supported = createSupportedCapability();

  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: null,
    title: null,
    url: 'https://example.test',
    videoByMode: {
      [CaptureMode.SCREEN]: supported,
      [CaptureMode.TAB]: supported,
      [CaptureMode.TAB_CROP]: supported,
      [CaptureMode.CAMERA]: supported,
    },
  };
}

function createSupportedCapability(): CapabilityState {
  return {
    reason: null,
    supported: true,
  };
}

function createRuntimePresets(
  overrides: PopupRuntimeStateSliceOverrides
): PopupRuntimeStateSlice['presets'] {
  return {
    quickActions: overrides.quickActions ?? [],
    quickActionsReady: overrides.quickActionsReady ?? true,
    selectedPreset: overrides.selectedPreset ?? null,
    selectedPresetId: overrides.selectedPresetId ?? null,
    screenshotStartupMode: overrides.screenshotStartupMode ?? null,
    clearScreenshotStartupMode: overrides.clearScreenshotStartupMode ?? vi.fn(),
    setQuickActions: overrides.setQuickActions ?? vi.fn(),
    setQuickActionsReady: overrides.setQuickActionsReady ?? vi.fn(),
    setSelectedPresetId: overrides.setSelectedPresetId ?? vi.fn(),
    setScreenshotStartupMode: overrides.setScreenshotStartupMode ?? vi.fn(),
    setVideoCaptureMode: overrides.setVideoCaptureMode ?? vi.fn(),
    setViewportPresets: overrides.setViewportPresets ?? vi.fn(),
    videoCaptureMode: overrides.videoCaptureMode ?? CaptureMode.TAB,
    viewportPresets: overrides.viewportPresets ?? [],
  };
}

function createRuntimeRecording(overrides: PopupRuntimeStateSliceOverrides) {
  return {
    clearStartError: overrides.clearStartError ?? vi.fn(),
    isStartPending: overrides.isStartPending ?? false,
    recordingActive: overrides.recordingActive ?? false,
    recordingControlCapability: overrides.recordingControlCapability ?? null,
    recordingState:
      overrides.recordingState ?? createRuntimeRecordingState(VideoRecordingStatus.RECORDING),
    setIsStartPending: overrides.setIsStartPending ?? vi.fn(),
    setRecordingControlCapability: overrides.setRecordingControlCapability ?? vi.fn(),
    setRecordingState: overrides.setRecordingState ?? vi.fn(),
    setStartError: overrides.setStartError ?? vi.fn(),
    setVideoSettings: overrides.setVideoSettings ?? vi.fn(),
    startError: overrides.startError ?? null,
    videoSettings: overrides.videoSettings ?? createVideoSettings(),
  };
}

function createRuntimeSession(overrides: PopupRuntimeStateSliceOverrides) {
  return {
    homeError: overrides.homeError ?? null,
    isReady: overrides.isReady ?? true,
    page: overrides.page ?? 'home',
    setHomeError: overrides.setHomeError ?? vi.fn(),
    setIsReady: overrides.setIsReady ?? vi.fn(),
    setPage: overrides.setPage ?? vi.fn(),
  };
}

function createVideoSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    countdownSeconds: 5,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}
