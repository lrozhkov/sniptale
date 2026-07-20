import { vi } from 'vitest';

import type {
  ActiveTabCapabilities,
  CapabilityState,
} from '@sniptale/runtime-contracts/tab-capabilities/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupRuntimeState } from '../../runtime/types/state';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';

type PopupRuntimeFlatOverrides = Partial<
  PopupRuntimeState['navigation'] &
    PopupRuntimeState['home'] &
    PopupRuntimeState['environment'] &
    PopupRuntimeState['recording']
>;

export type PopupRuntimeStateOverrides = PopupRuntimeFlatOverrides & {
  navigation?: Partial<PopupRuntimeState['navigation']>;
  home?: Partial<PopupRuntimeState['home']>;
  environment?: Partial<PopupRuntimeState['environment']>;
  recording?: Partial<PopupRuntimeState['recording']>;
  pageAccess?: PopupPageAccessRuntime;
};

export function createPopupAppShellActiveTabCapabilities(
  overrides: Partial<ActiveTabCapabilities> = {}
): ActiveTabCapabilities {
  const supported = createSupportedCapability();
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 1,
    title: null,
    url: 'https://example.test',
    videoByMode: {
      [CaptureMode.SCREEN]: supported,
      [CaptureMode.TAB]: supported,
      [CaptureMode.TAB_CROP]: supported,
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: supported,
    },
    ...overrides,
  };
}

export function createPopupAppShellRuntime(
  overrides: PopupRuntimeStateOverrides = {}
): PopupRuntimeState {
  return {
    navigation: createRuntimeNavigation(overrides),
    home: createRuntimeHome(overrides),
    environment: createRuntimeEnvironment(overrides),
    recording: createRuntimeRecording(overrides),
  };
}

function createRuntimeNavigation(overrides: PopupRuntimeStateOverrides) {
  return {
    isReady: overrides.isReady ?? true,
    page: overrides.page ?? 'home',
    setPage: overrides.setPage ?? vi.fn(),
    showFooter: overrides.showFooter ?? true,
    ...overrides.navigation,
  };
}

function createRuntimeHome(overrides: PopupRuntimeStateOverrides) {
  return {
    displayMode: overrides.displayMode ?? 'list',
    homeError: overrides.homeError ?? null,
    quickActions: overrides.quickActions ?? [],
    quickActionsReady: overrides.quickActionsReady ?? true,
    viewportPresets: overrides.viewportPresets ?? [
      { id: 'preset-1', label: '', width: 1280, height: 720 },
    ],
    ...overrides.home,
  };
}

function createRuntimeEnvironment(overrides: PopupRuntimeStateOverrides) {
  return {
    activeTabCapabilities:
      overrides.activeTabCapabilities ?? createPopupAppShellActiveTabCapabilities(),
    galleryStatus: overrides.galleryStatus ?? { text: '3 projects', pressure: 'healthy' },
    ...(overrides.pageAccess ? { pageAccess: overrides.pageAccess } : {}),
    ...overrides.environment,
  };
}

function createRuntimeRecording(overrides: PopupRuntimeStateOverrides) {
  return {
    recordingControlCapability: overrides.recordingControlCapability ?? null,
    clearStartError: overrides.clearStartError ?? vi.fn(),
    appliedViewportPresetId: overrides.appliedViewportPresetId ?? null,
    appliedViewportTabId: overrides.appliedViewportTabId ?? null,
    handlePauseResume: overrides.handlePauseResume ?? vi.fn(),
    handleStartRecording: overrides.handleStartRecording ?? vi.fn(),
    handleStop: overrides.handleStop ?? vi.fn(),
    handleToggleMicrophone: overrides.handleToggleMicrophone ?? vi.fn(),
    handleToggleWebcam: overrides.handleToggleWebcam ?? vi.fn(),
    handleUpdateRecordingSettings: overrides.handleUpdateRecordingSettings ?? vi.fn(),
    isLoadingMicrophones: overrides.isLoadingMicrophones ?? false,
    isLoadingWebcams: overrides.isLoadingWebcams ?? false,
    isStartPending: overrides.isStartPending ?? false,
    microphoneDevices: overrides.microphoneDevices ?? [{ deviceId: 'mic-1', label: '' }],
    recordingActive: overrides.recordingActive ?? false,
    recordingState: overrides.recordingState ?? createRuntimeRecordingState(),
    selectedPreset: overrides.selectedPreset ?? null,
    selectedPresetId: overrides.selectedPresetId ?? 'preset-1',
    setSelectedPresetId: overrides.setSelectedPresetId ?? vi.fn(),
    setAppliedViewportPresetId: overrides.setAppliedViewportPresetId ?? vi.fn(),
    setAppliedViewportTabId: overrides.setAppliedViewportTabId ?? vi.fn(),
    setStartError: overrides.setStartError ?? vi.fn(),
    setVideoCaptureMode: overrides.setVideoCaptureMode ?? vi.fn(),
    setRecordingState: overrides.setRecordingState ?? vi.fn(),
    setVideoSettings: overrides.setVideoSettings ?? vi.fn(),
    startError: overrides.startError ?? null,
    videoCaptureMode: overrides.videoCaptureMode ?? CaptureMode.VIEWPORT_EMULATION,
    videoSettings: overrides.videoSettings ?? DEFAULT_VIDEO_SETTINGS,
    webcamDevices: overrides.webcamDevices ?? [{ deviceId: 'cam-1', label: '' }],
    ...overrides.recording,
  };
}

function createRuntimeRecordingState() {
  return {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPreset: null,
  };
}

function createSupportedCapability(): CapabilityState {
  return {
    supported: true,
    reason: null,
  };
}
