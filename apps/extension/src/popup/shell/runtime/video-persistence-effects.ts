import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type {
  CaptureMode,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n/popup';
import {
  areVideoSettingsEqual,
  createVideoSettingsPatch,
  persistVideoSettings,
  persistVideoUiState,
} from '../../recording/persistence';

const logger = createLogger({ namespace: 'PopupVideoPersistence' });

type VideoPersistenceState = {
  isReady: boolean;
  selectedPresetId: string | null;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  setVideoCaptureMode: Dispatch<SetStateAction<CaptureMode>>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  videoCaptureMode: CaptureMode;
  videoSettings: VideoRecordingSettings;
};

export function usePopupVideoPersistenceEffects(state: VideoPersistenceState): void {
  useVideoSettingsPersistenceEffect(state);
  useVideoUiStatePersistenceEffect(state);
}

function useVideoSettingsPersistenceEffect(state: VideoPersistenceState): void {
  const { isReady, setVideoSettings, videoSettings } = state;
  const committedRef = useRef(videoSettings);
  const enqueuedRef = useRef(videoSettings);
  const latestRef = useRef(videoSettings);
  const failedPatchRef = useRef<Partial<VideoRecordingSettings>>({});
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const restoringRef = useRef(false);
  const wasReadyRef = useRef(isReady);
  latestRef.current = videoSettings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !wasReadyRef.current) {
      committedRef.current = videoSettings;
      enqueuedRef.current = videoSettings;
      failedPatchRef.current = {};
      wasReadyRef.current = isReady;
      return;
    }
    if (restoringRef.current) {
      restoringRef.current = false;
      enqueuedRef.current = videoSettings;
      return;
    }
    if (areVideoSettingsEqual(enqueuedRef.current, videoSettings)) return;

    const previous = enqueuedRef.current;
    const desired = videoSettings;
    const localPatch = createVideoSettingsPatch(previous, desired);
    enqueuedRef.current = desired;
    queueRef.current = queueRef.current.then(async () => {
      const patch = { ...failedPatchRef.current, ...localPatch };
      failedPatchRef.current = {};
      if (Object.keys(patch).length === 0) return;
      try {
        const persisted = await persistVideoSettings(patch);
        committedRef.current = persisted;
        if (
          mountedRef.current &&
          areVideoSettingsEqual(enqueuedRef.current, desired) &&
          !areVideoSettingsEqual(persisted, latestRef.current)
        ) {
          restoringRef.current = true;
          enqueuedRef.current = persisted;
          setVideoSettings(persisted);
        }
      } catch (error) {
        logger.error('Failed to persist video settings', error);
        if (!areVideoSettingsEqual(enqueuedRef.current, desired)) {
          failedPatchRef.current = { ...patch, ...failedPatchRef.current };
        } else if (mountedRef.current) {
          restoringRef.current = true;
          enqueuedRef.current = committedRef.current;
          setVideoSettings(committedRef.current);
        }
        toast.error(translate('common.states.error'));
      }
    });
  }, [isReady, setVideoSettings, videoSettings]);
}

function useVideoUiStatePersistenceEffect(state: VideoPersistenceState): void {
  const { isReady, selectedPresetId, setSelectedPresetId, setVideoCaptureMode, videoCaptureMode } =
    state;
  const committedRef = useRef({
    selectedPresetId,
    videoCaptureMode,
  });
  const restoringRef = useRef(false);

  useEffect(() => {
    if (!isReady) return;
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const guard = { cancelled: false };
    void persistVideoUiState(videoCaptureMode, selectedPresetId)
      .then(() => {
        if (!guard.cancelled) {
          committedRef.current = {
            selectedPresetId,
            videoCaptureMode,
          };
        }
      })
      .catch((error) => {
        logger.error('Failed to persist video UI state', error);
        if (guard.cancelled) return;
        restoringRef.current = true;
        setVideoCaptureMode(committedRef.current.videoCaptureMode);
        setSelectedPresetId(committedRef.current.selectedPresetId);
        toast.error(translate('common.states.error'));
      });
    return () => {
      guard.cancelled = true;
    };
  }, [isReady, selectedPresetId, setSelectedPresetId, setVideoCaptureMode, videoCaptureMode]);
}
