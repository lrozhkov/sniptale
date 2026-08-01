import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { type MicrophoneOption } from '../../recording/microphone';
import { type RefreshMicrophoneDevicesOptions } from '../../recording/microphone-flow';
import { type WebcamOption } from '../../recording/webcam';
import { type RefreshWebcamDevicesOptions } from '../../recording/webcam-flow';
import {
  areVideoSettingsEqual,
  createVideoSettingsPatch,
  persistVideoSettings,
  persistVideoUiState,
} from '../../recording/persistence';
import type { PopupPage } from '../navigation/actions';
import { usePopupMediaDeviceEffects } from './media-device-effects';
import type { RecordingControlCapability } from './recording-control-capability';
import { usePopupRecordingNavigationEffect } from './recording-navigation-effect';
const logger = createLogger({ namespace: 'PopupRuntimeEffects' });
type VideoUiStateSnapshot = {
  selectedPresetId: string | null;
  videoCaptureMode: CaptureMode;
};
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
  const enqueuedVideoSettingsRef = useRef(state.videoSettings);
  const latestVideoSettingsRef = useRef(state.videoSettings);
  const failedVideoSettingsPatchRef = useRef<Partial<VideoRecordingSettings>>({});
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const restoringVideoSettingsRef = useRef(false);
  const wasReadyRef = useRef(state.isReady);
  const { isReady, setVideoSettings, videoSettings } = state;
  latestVideoSettingsRef.current = videoSettings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      committedVideoSettingsRef.current = videoSettings;
      enqueuedVideoSettingsRef.current = videoSettings;
      failedVideoSettingsPatchRef.current = {};
      wasReadyRef.current = false;
      return;
    }

    if (!wasReadyRef.current) {
      committedVideoSettingsRef.current = videoSettings;
      enqueuedVideoSettingsRef.current = videoSettings;
      failedVideoSettingsPatchRef.current = {};
      wasReadyRef.current = true;
      return;
    }

    if (restoringVideoSettingsRef.current) {
      restoringVideoSettingsRef.current = false;
      enqueuedVideoSettingsRef.current = videoSettings;
      return;
    }

    if (areVideoSettingsEqual(enqueuedVideoSettingsRef.current, videoSettings)) {
      return;
    }

    const previousEnqueued = enqueuedVideoSettingsRef.current;
    const desired = videoSettings;
    const localPatch = createVideoSettingsPatch(previousEnqueued, desired);
    enqueuedVideoSettingsRef.current = desired;
    persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
      const patch = { ...failedVideoSettingsPatchRef.current, ...localPatch };
      failedVideoSettingsPatchRef.current = {};
      if (Object.keys(patch).length === 0) return;
      try {
        const persisted = await persistVideoSettings(patch);
        committedVideoSettingsRef.current = persisted;
        if (
          mountedRef.current &&
          areVideoSettingsEqual(enqueuedVideoSettingsRef.current, desired) &&
          !areVideoSettingsEqual(persisted, latestVideoSettingsRef.current)
        ) {
          restoringVideoSettingsRef.current = true;
          enqueuedVideoSettingsRef.current = persisted;
          setVideoSettings(persisted);
        }
      } catch (error) {
        logger.error('Failed to persist video settings', error);
        const hasNewerLocalSettings = !areVideoSettingsEqual(
          enqueuedVideoSettingsRef.current,
          desired
        );
        if (hasNewerLocalSettings) {
          failedVideoSettingsPatchRef.current = {
            ...patch,
            ...failedVideoSettingsPatchRef.current,
          };
        } else if (mountedRef.current) {
          const committed = committedVideoSettingsRef.current;
          restoringVideoSettingsRef.current = true;
          enqueuedVideoSettingsRef.current = committed;
          setVideoSettings(committed);
        }
        toast.error(translate('common.states.error'));
      }
    });
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
