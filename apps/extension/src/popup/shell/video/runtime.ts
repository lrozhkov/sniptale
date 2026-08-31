import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type { ViewportPreset } from '../../../contracts/settings';
import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';
import type { PopupVideoRuntimeStateSlice } from '../runtime/types/internal-state';
import type { RecordingControlCapability } from '../runtime/recording-control-capability';
import { usePopupRuntimeActions } from '../runtime/actions';
import { usePopupMediaDeviceEffects } from '../runtime/media-device-effects';
import { usePopupVideoPersistenceEffects } from '../runtime/video-persistence-effects';
import { IDLE_RECORDING_STATE } from '../../recording/video/copy';

export function useVideoRouteRuntime(options: {
  capabilities: ActiveTabCapabilities;
  initialMode?: CaptureMode;
}): PopupVideoRuntimeStateSlice & { isReady: boolean; setIsReady(ready: boolean): void } {
  const [isReady, setIsReady] = useState(false);
  const [viewportPresets, setViewportPresets] = useState<ViewportPreset[]>([]);
  const [videoCaptureMode, setVideoCaptureMode] = useState(options.initialMode ?? CaptureMode.TAB);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [videoSettings, setVideoSettings] = useState(DEFAULT_VIDEO_SETTINGS);
  const [recordingControlCapability, setRecordingControlCapability] =
    useState<RecordingControlCapability | null>(null);
  const [recordingState, setRecordingState] = useState(IDLE_RECORDING_STATE);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStartPending, setIsStartPending] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MicrophoneOption[]>([]);
  const [webcamDevices, setWebcamDevices] = useState<WebcamOption[]>([]);
  const [isLoadingMicrophones, setIsLoadingMicrophones] = useState(false);
  const [isLoadingWebcams, setIsLoadingWebcams] = useState(false);
  const [galleryStatus, setGalleryStatus] = useState<{
    text: string;
    pressure: StoragePressureLevel;
  } | null>(null);
  const [activeTabCapabilities, setActiveTabCapabilities] = useState(
    () => options.capabilities ?? getTabCapabilities(null)
  );
  const clearStartError = useCallback(() => setStartError(null), []);
  const selectedPreset = useMemo(
    () => viewportPresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [selectedPresetId, viewportPresets]
  );
  const actions = usePopupRuntimeActions({
    microphoneDevices,
    webcamDevices,
    setActiveTabCapabilities,
    setGalleryStatus,
    setIsLoadingMicrophones,
    setIsLoadingWebcams,
    setMicrophoneDevices,
    setWebcamDevices,
  });
  const { refreshGalleryStatus } = actions;
  const state: PopupVideoRuntimeStateSlice = {
    actions,
    devices: {
      microphoneDevices,
      setMicrophoneDevices,
      isLoadingMicrophones,
      setIsLoadingMicrophones,
      webcamDevices,
      setWebcamDevices,
      isLoadingWebcams,
      setIsLoadingWebcams,
    },
    environment: {
      activeTabCapabilities,
      galleryStatus,
      setActiveTabCapabilities,
      setGalleryStatus,
    },
    presets: {
      selectedPreset,
      selectedPresetId,
      setSelectedPresetId,
      setVideoCaptureMode,
      setViewportPresets,
      videoCaptureMode,
      viewportPresets,
    },
    recording: {
      recordingControlCapability,
      setRecordingControlCapability,
      videoSettings,
      setVideoSettings,
      recordingState,
      setRecordingState,
      startError,
      setStartError,
      isStartPending,
      setIsStartPending,
      recordingActive: recordingState.status !== 'IDLE',
      clearStartError,
    },
  };

  usePopupMediaDeviceEffects({
    page: isReady ? 'video' : 'menu',
    refreshMicrophones: actions.refreshMicrophones,
    refreshWebcams: actions.refreshWebcams,
    videoSettings,
  });
  usePopupVideoPersistenceEffects({
    isReady,
    selectedPresetId,
    setSelectedPresetId,
    setVideoCaptureMode,
    setVideoSettings,
    videoCaptureMode,
    videoSettings,
  });
  useEffect(() => {
    if (isReady) void refreshGalleryStatus();
  }, [isReady, refreshGalleryStatus]);

  return { ...state, isReady, setIsReady };
}
