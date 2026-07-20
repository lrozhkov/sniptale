import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import { type ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { type StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { type MicrophoneOption } from '../../recording/microphone';
import {
  refreshMicrophoneDevices,
  type RefreshMicrophoneDevicesOptions,
} from '../../recording/microphone-flow';
import { type WebcamOption } from '../../recording/webcam';
import {
  refreshWebcamDevices,
  type RefreshWebcamDevicesOptions,
} from '../../recording/webcam-flow';
import { persistVideoSettings, persistVideoUiState } from '../../recording/persistence';
import type { PopupPage } from '../navigation/actions';
import { useGalleryStatusUpdater } from '../gallery/status';
import { usePopupMediaDeviceEffects } from './media-device-effects';
import type { RecordingControlCapability } from './recording-control-capability';
import { usePopupRecordingNavigationEffect } from './recording-navigation-effect';
const logger = createLogger({ namespace: 'PopupRuntimeEffects' });
type VideoUiStateSnapshot = {
  selectedPresetId: string | null;
  videoCaptureMode: CaptureMode;
};
type PopupRuntimeActionsParams = {
  microphoneDevices: MicrophoneOption[];
  setActiveTabCapabilities: Dispatch<SetStateAction<ActiveTabCapabilities>>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
  setIsLoadingMicrophones: Dispatch<SetStateAction<boolean>>;
  setIsLoadingWebcams: Dispatch<SetStateAction<boolean>>;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  webcamDevices: WebcamOption[];
};
function useLatestDeviceRefs(params: {
  microphoneDevices: MicrophoneOption[];
  webcamDevices: WebcamOption[];
}) {
  const microphoneDevicesRef = useRef(params.microphoneDevices);
  const webcamDevicesRef = useRef(params.webcamDevices);

  useEffect(() => {
    microphoneDevicesRef.current = params.microphoneDevices;
  }, [params.microphoneDevices]);

  useEffect(() => {
    webcamDevicesRef.current = params.webcamDevices;
  }, [params.webcamDevices]);

  return { microphoneDevicesRef, webcamDevicesRef };
}

export function usePopupRuntimeActions(params: PopupRuntimeActionsParams) {
  const { microphoneDevicesRef, webcamDevicesRef } = useLatestDeviceRefs(params);

  const refreshMicrophones = useCallback(
    (options?: RefreshMicrophoneDevicesOptions) =>
      refreshMicrophoneDevices(
        params.setIsLoadingMicrophones,
        params.setMicrophoneDevices,
        microphoneDevicesRef.current,
        options
      ),
    [microphoneDevicesRef, params.setIsLoadingMicrophones, params.setMicrophoneDevices]
  );
  const refreshWebcams = useCallback(
    (options?: RefreshWebcamDevicesOptions) =>
      refreshWebcamDevices(
        params.setIsLoadingWebcams,
        params.setWebcamDevices,
        webcamDevicesRef.current,
        options
      ),
    [params.setIsLoadingWebcams, params.setWebcamDevices, webcamDevicesRef]
  );
  const refreshGalleryStatus = useGalleryStatusUpdater(params.setGalleryStatus);
  const refreshActiveTabCapabilities = useCallback(async () => {
    try {
      const [tab] = await browserTabs.query({ active: true, currentWindow: true });
      params.setActiveTabCapabilities(getTabCapabilities(tab));
    } catch (error) {
      logger.error('Failed to resolve active tab capabilities', error);
      params.setActiveTabCapabilities(getTabCapabilities(null));
    }
  }, [params]);

  return { refreshMicrophones, refreshWebcams, refreshGalleryStatus, refreshActiveTabCapabilities };
}

export function usePopupRuntimeEffects(state: {
  isReady: boolean;
  page: PopupPage;
  videoSettings: VideoRecordingSettings;
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  recordingState: VideoRecordingRuntimeState;
  setRecordingControlCapability: Dispatch<SetStateAction<RecordingControlCapability | null>>;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<PopupPage>>;
  microphoneDevices: MicrophoneOption[];
  webcamDevices: WebcamOption[];
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
}) {
  usePopupMediaDeviceEffects({
    microphoneDevices: state.microphoneDevices,
    refreshMicrophones: state.refreshMicrophones,
    refreshWebcams: state.refreshWebcams,
    setVideoSettings: state.setVideoSettings,
    webcamDevices: state.webcamDevices,
  });
  usePopupPersistenceEffects(state);
  usePopupRecordingNavigationEffect(state);
}

function usePopupPersistenceEffects(state: {
  isReady: boolean;
  videoSettings: VideoRecordingSettings;
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
}) {
  useVideoSettingsPersistenceEffect(state);
  useVideoUiStatePersistenceEffect(state);
}

function useVideoSettingsPersistenceEffect(state: {
  isReady: boolean;
  videoSettings: VideoRecordingSettings;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
}) {
  const committedVideoSettingsRef = useRef(state.videoSettings);
  const restoringVideoSettingsRef = useRef(false);
  const { isReady, setVideoSettings, videoSettings } = state;

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (restoringVideoSettingsRef.current) {
      restoringVideoSettingsRef.current = false;
      return;
    }

    let cancelled = false;

    persistVideoSettings(videoSettings)
      .then(() => {
        if (!cancelled) {
          committedVideoSettingsRef.current = videoSettings;
        }
      })
      .catch((error) => {
        logger.error('Failed to persist video settings', error);
        if (cancelled) {
          return;
        }
        restoringVideoSettingsRef.current = true;
        setVideoSettings(committedVideoSettingsRef.current);
        toast.error(translate('common.states.error'));
      });

    return () => {
      cancelled = true;
    };
  }, [isReady, setVideoSettings, videoSettings]);
}

function useVideoUiStatePersistenceEffect(state: {
  isReady: boolean;
  videoCaptureMode: CaptureMode;
  selectedPresetId: string | null;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
}) {
  const committedVideoUiStateRef = useRef({
    selectedPresetId: state.selectedPresetId,
    videoCaptureMode: state.videoCaptureMode,
  });
  const restoringVideoUiStateRef = useRef(false);
  const { isReady, selectedPresetId, setSelectedPresetId, setVideoCaptureMode, videoCaptureMode } =
    state;

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (restoringVideoUiStateRef.current) {
      restoringVideoUiStateRef.current = false;
      return;
    }

    const guard = { cancelled: false };
    persistVideoUiStateWithRollback({
      committedVideoUiStateRef,
      guard,
      restoringVideoUiStateRef,
      selectedPresetId,
      setSelectedPresetId,
      setVideoCaptureMode,
      videoCaptureMode,
    });

    return () => {
      guard.cancelled = true;
    };
  }, [isReady, selectedPresetId, setSelectedPresetId, setVideoCaptureMode, videoCaptureMode]);
}

function persistVideoUiStateWithRollback(params: {
  committedVideoUiStateRef: { current: VideoUiStateSnapshot };
  guard: { cancelled: boolean };
  restoringVideoUiStateRef: { current: boolean };
  selectedPresetId: string | null;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  videoCaptureMode: CaptureMode;
}) {
  persistVideoUiState(params.videoCaptureMode, params.selectedPresetId)
    .then(() => {
      if (!params.guard.cancelled) {
        params.committedVideoUiStateRef.current = {
          selectedPresetId: params.selectedPresetId,
          videoCaptureMode: params.videoCaptureMode,
        };
      }
    })
    .catch((error) => {
      logger.error('Failed to persist video UI state', error);
      if (params.guard.cancelled) {
        return;
      }
      restoreCommittedVideoUiState(params);
      toast.error(translate('common.states.error'));
    });
}

function restoreCommittedVideoUiState(params: {
  committedVideoUiStateRef: { current: VideoUiStateSnapshot };
  restoringVideoUiStateRef: { current: boolean };
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
}) {
  params.restoringVideoUiStateRef.current = true;
  params.setVideoCaptureMode(params.committedVideoUiStateRef.current.videoCaptureMode);
  params.setSelectedPresetId(params.committedVideoUiStateRef.current.selectedPresetId);
}
