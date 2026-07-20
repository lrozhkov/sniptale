import { useCallback, useMemo, useState } from 'react';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import { type ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { DEFAULT_QUICK_ACTIONS_DISPLAY_MODE } from '../../../features/quick-actions-presets/display-mode';
import { type StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../contracts/settings';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { IDLE_RECORDING_STATE, type PopupPage } from '../navigation/actions';
import { type MicrophoneOption } from '../../recording/microphone';
import { type WebcamOption } from '../../recording/webcam';
import { isRecordingActive, resolveSelectedPreset, shouldShowFooter } from './model';
import { usePopupRuntimeActions, usePopupRuntimeEffects } from './effects';
import type { RecordingControlCapability } from './recording-control-capability';
import type {
  PopupRuntimeCoreState,
  PopupRuntimeDerivedState,
  PopupRuntimeRefreshActions,
  PopupRuntimeStateSlice,
} from './types/internal-state';
export type { PopupRuntimeStateSlice } from './types/internal-state';

export function usePopupRuntimeState(): PopupRuntimeStateSlice {
  const state = usePopupRuntimeCoreState();
  const derived = usePopupRuntimeDerivedState(state);
  const actions = usePopupRuntimeActionGroup(state);

  usePopupRuntimeEffectSync(state, actions);

  return assemblePopupRuntimeStateSlice(state, actions, derived);
}

function usePopupRuntimeDerivedState(state: PopupRuntimeCoreState) {
  const selectedPreset = useMemo(
    () => resolveSelectedPreset(state.presets.viewportPresets, state.presets.selectedPresetId),
    [state.presets.selectedPresetId, state.presets.viewportPresets]
  );
  const recordingActive = useMemo(
    () => isRecordingActive(state.recording.recordingState),
    [state.recording.recordingState]
  );
  const showFooter = useMemo(
    () => shouldShowFooter(state.session.page, state.recording.recordingState),
    [state.session.page, state.recording.recordingState]
  );

  return { recordingActive, selectedPreset, showFooter };
}

function usePopupRuntimeActionGroup(state: PopupRuntimeCoreState) {
  return usePopupRuntimeActions({
    microphoneDevices: state.devices.microphoneDevices,
    webcamDevices: state.devices.webcamDevices,
    setActiveTabCapabilities: state.environment.setActiveTabCapabilities,
    setGalleryStatus: state.environment.setGalleryStatus,
    setIsLoadingMicrophones: state.devices.setIsLoadingMicrophones,
    setIsLoadingWebcams: state.devices.setIsLoadingWebcams,
    setMicrophoneDevices: state.devices.setMicrophoneDevices,
    setWebcamDevices: state.devices.setWebcamDevices,
  });
}

function usePopupRuntimeEffectSync(
  state: PopupRuntimeCoreState,
  actions: PopupRuntimeRefreshActions
) {
  usePopupRuntimeEffects(createPopupRuntimeEffectState(state, actions));
}

function createPopupRuntimeEffectState(
  state: PopupRuntimeCoreState,
  actions: PopupRuntimeRefreshActions
) {
  return {
    isReady: state.session.isReady,
    page: state.session.page,
    videoSettings: state.recording.videoSettings,
    videoCaptureMode: state.presets.videoCaptureMode,
    selectedPresetId: state.presets.selectedPresetId,
    recordingState: state.recording.recordingState,
    setRecordingControlCapability: state.recording.setRecordingControlCapability,
    setIsStartPending: state.recording.setIsStartPending,
    setStartError: state.recording.setStartError,
    setPage: state.session.setPage,
    microphoneDevices: state.devices.microphoneDevices,
    webcamDevices: state.devices.webcamDevices,
    setSelectedPresetId: state.presets.setSelectedPresetId,
    setVideoCaptureMode: state.presets.setVideoCaptureMode,
    setVideoSettings: state.recording.setVideoSettings,
    refreshMicrophones: actions.refreshMicrophones,
    refreshWebcams: actions.refreshWebcams,
  };
}

function assemblePopupRuntimeStateSlice(
  state: PopupRuntimeCoreState,
  actions: PopupRuntimeRefreshActions,
  derived: PopupRuntimeDerivedState & {
    recordingActive: boolean;
    selectedPreset: ViewportPreset | null;
  }
): PopupRuntimeStateSlice {
  return {
    session: state.session,
    presets: {
      ...state.presets,
      selectedPreset: derived.selectedPreset,
    },
    recording: {
      ...state.recording,
      recordingActive: derived.recordingActive,
    },
    devices: state.devices,
    environment: state.environment,
    actions,
    derived: { showFooter: derived.showFooter },
  };
}

function usePopupRuntimeCoreState(): PopupRuntimeCoreState {
  const sessionState = usePopupSessionState();
  const presetState = usePopupCapturePresetState();
  const recordingControls = usePopupRecordingControls();
  const microphoneState = usePopupMicrophoneState();
  const webcamState = usePopupWebcamState();
  const environmentState = usePopupEnvironmentState();

  return {
    session: sessionState,
    presets: presetState,
    recording: recordingControls,
    devices: {
      ...microphoneState,
      ...webcamState,
    },
    environment: environmentState,
  };
}

function usePopupSessionState() {
  const [homeError, setHomeError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [page, setPage] = useState<PopupPage>('home');

  return {
    homeError,
    isReady,
    page,
    setHomeError,
    setIsReady,
    setPage,
  };
}

function usePopupCapturePresetState() {
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [quickActionsReady, setQuickActionsReady] = useState(false);
  const [displayMode, setDisplayMode] = useState<QuickActionsDisplayMode>(
    DEFAULT_QUICK_ACTIONS_DISPLAY_MODE
  );
  const [viewportPresets, setViewportPresets] = useState<ViewportPreset[]>([]);
  const [videoCaptureMode, setVideoCaptureMode] = useState<CaptureMode>(CaptureMode.TAB);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [appliedViewportPresetId, setAppliedViewportPresetId] = useState<string | null>(null);
  const [appliedViewportTabId, setAppliedViewportTabId] = useState<number | null>(null);

  return {
    appliedViewportPresetId,
    appliedViewportTabId,
    displayMode,
    quickActions,
    quickActionsReady,
    selectedPresetId,
    setAppliedViewportPresetId,
    setAppliedViewportTabId,
    setDisplayMode,
    setQuickActions,
    setQuickActionsReady,
    setSelectedPresetId,
    setVideoCaptureMode,
    setViewportPresets,
    videoCaptureMode,
    viewportPresets,
  };
}

function usePopupEnvironmentState() {
  const [activeTabCapabilities, setActiveTabCapabilities] = useState<ActiveTabCapabilities>(() =>
    getTabCapabilities(null)
  );
  const [galleryStatus, setGalleryStatus] = useState<{
    text: string;
    pressure: StoragePressureLevel;
  } | null>(null);

  return {
    activeTabCapabilities,
    galleryStatus,
    setActiveTabCapabilities,
    setGalleryStatus,
  };
}

function usePopupRecordingControls() {
  const [videoSettings, setVideoSettings] = useState(DEFAULT_VIDEO_SETTINGS);
  const [recordingControlCapability, setRecordingControlCapability] =
    useState<RecordingControlCapability | null>(null);
  const [recordingState, setRecordingState] =
    useState<VideoRecordingRuntimeState>(IDLE_RECORDING_STATE);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStartPending, setIsStartPending] = useState(false);

  const clearStartError = useCallback(() => {
    setStartError(null);
  }, []);

  return {
    videoSettings,
    setVideoSettings,
    recordingControlCapability,
    setRecordingControlCapability,
    recordingState,
    setRecordingState,
    startError,
    setStartError,
    isStartPending,
    setIsStartPending,
    clearStartError,
  };
}

function usePopupMicrophoneState() {
  const [microphoneDevices, setMicrophoneDevices] = useState<MicrophoneOption[]>([]);
  const [isLoadingMicrophones, setIsLoadingMicrophones] = useState(false);

  return {
    microphoneDevices,
    setMicrophoneDevices,
    isLoadingMicrophones,
    setIsLoadingMicrophones,
  };
}

function usePopupWebcamState() {
  const [webcamDevices, setWebcamDevices] = useState<WebcamOption[]>([]);
  const [isLoadingWebcams, setIsLoadingWebcams] = useState(false);

  return {
    webcamDevices,
    setWebcamDevices,
    isLoadingWebcams,
    setIsLoadingWebcams,
  };
}
