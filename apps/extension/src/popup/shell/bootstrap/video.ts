import type { Settings, ViewportPreset } from '../../../contracts/settings';
import { loadSettings } from '../../../composition/persistence/settings';
import {
  loadVideoSettings,
  loadVideoUiState,
} from '../../../composition/persistence/capture-settings';
import {
  type CaptureMode,
  type VideoRecordingSettings,
  type VideoRecordingUiState,
} from '@sniptale/runtime-contracts/video/types/types';
import { trackPopupPerfAsync } from '../../diagnostics/performance';
import { resolveVideoViewportPresetId } from '../../../features/viewport-presets/video-recording-policy';

type PopupBootstrapVideoData = {
  captureMode: CaptureMode;
  selectedPresetId: string | null;
  videoSettings: VideoRecordingSettings;
  viewportPresets: ViewportPreset[];
};

type PopupVideoBootstrapStorageData = {
  settings: Settings;
  storedVideoSettings: VideoRecordingSettings;
  storedVideoUiState: VideoRecordingUiState;
};

type PopupVideoBootstrapPromises = {
  settingsPromise: Promise<Settings>;
  storedVideoSettingsPromise: Promise<VideoRecordingSettings>;
  storedVideoUiStatePromise: Promise<VideoRecordingUiState>;
};

export function createPopupVideoBootstrapPromises(): PopupVideoBootstrapPromises {
  return {
    settingsPromise: trackPopupPerfAsync('popup.bootstrap.settings', loadSettings),
    storedVideoSettingsPromise: trackPopupPerfAsync(
      'popup.bootstrap.video-settings',
      loadVideoSettings
    ),
    storedVideoUiStatePromise: trackPopupPerfAsync(
      'popup.bootstrap.video-ui-state',
      loadVideoUiState
    ),
  };
}

export async function loadPopupBootstrapVideoData(
  promises: PopupVideoBootstrapPromises
): Promise<PopupBootstrapVideoData> {
  const storageData = await loadPopupVideoBootstrapStorageData(promises);
  return buildPopupBootstrapVideoData(storageData);
}

async function loadPopupVideoBootstrapStorageData(
  promises: PopupVideoBootstrapPromises
): Promise<PopupVideoBootstrapStorageData> {
  const [settings, storedVideoSettings, storedVideoUiState] = await Promise.all([
    promises.settingsPromise,
    promises.storedVideoSettingsPromise,
    promises.storedVideoUiStatePromise,
  ]);

  return {
    settings,
    storedVideoSettings,
    storedVideoUiState,
  };
}

function buildPopupBootstrapVideoData(
  data: PopupVideoBootstrapStorageData
): PopupBootstrapVideoData {
  const { settings, storedVideoSettings, storedVideoUiState } = data;
  const viewportPresets = settings.viewportPresets ?? [];
  const rawPresetId = storedVideoUiState.viewportPresetId ?? null;
  const captureMode = storedVideoUiState.captureMode;
  const selectedPresetId = resolveVideoViewportPresetId(captureMode, viewportPresets, rawPresetId);

  return {
    captureMode,
    selectedPresetId,
    videoSettings: storedVideoSettings,
    viewportPresets,
  };
}
