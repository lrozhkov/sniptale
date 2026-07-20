import type { Settings, ViewportPreset } from '../../../contracts/settings';
import { loadSettings } from '../../../composition/persistence/settings';
import {
  loadVideoSettings,
  loadVideoUiState,
} from '../../../composition/persistence/capture-settings';
import {
  CaptureMode,
  type VideoRecordingSettings,
  type VideoRecordingUiState,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  loadMicrophoneDevices,
  resolveMicrophoneDeviceId,
  type MicrophoneOption,
} from '../../recording/microphone';
import {
  loadWebcamDevices,
  resolveWebcamDeviceId,
  type WebcamOption,
} from '../../recording/webcam';
import { trackPopupPerfAsync } from '../../diagnostics/performance';

const logger = createLogger({ namespace: 'PopupBootstrap' });

type PopupBootstrapVideoData = {
  captureMode: CaptureMode;
  microphones: MicrophoneOption[];
  webcams: WebcamOption[];
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
  microphonesPromise: Promise<MicrophoneOption[]>;
  webcamsPromise: Promise<WebcamOption[]>;
  settingsPromise: Promise<Settings>;
  storedVideoSettingsPromise: Promise<VideoRecordingSettings>;
  storedVideoUiStatePromise: Promise<VideoRecordingUiState>;
};

export function createPopupVideoBootstrapPromises(): PopupVideoBootstrapPromises {
  return {
    microphonesPromise: trackPopupPerfAsync('popup.bootstrap.microphones', () =>
      loadBootstrapMicrophones()
    ),
    webcamsPromise: trackPopupPerfAsync('popup.bootstrap.webcams', () => loadBootstrapWebcams()),
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
  const microphones = await resolveBootstrapMicrophones(storageData, promises.microphonesPromise);
  const webcams = await resolveBootstrapWebcams(storageData, promises.webcamsPromise);

  return buildPopupBootstrapVideoData(storageData, microphones, webcams);
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

async function loadBootstrapMicrophones(): Promise<MicrophoneOption[]> {
  try {
    return await loadMicrophoneDevices();
  } catch (error) {
    logger.error('Failed to bootstrap microphones', error);
    return [];
  }
}

async function loadBootstrapWebcams(): Promise<WebcamOption[]> {
  try {
    return await loadWebcamDevices();
  } catch (error) {
    logger.error('Failed to bootstrap webcams', error);
    return [];
  }
}

async function resolveBootstrapMicrophones(
  data: PopupVideoBootstrapStorageData,
  microphonesPromise: Promise<MicrophoneOption[]>
): Promise<MicrophoneOption[]> {
  const microphones = await microphonesPromise;
  if (!data.storedVideoSettings.microphoneEnabled) {
    return microphones;
  }

  return loadMicrophoneDevices({
    knownDevices: microphones,
    hydrateLabels: 'if-permission-granted',
    preferredDeviceId: data.storedVideoSettings.microphoneDeviceId,
  });
}

async function resolveBootstrapWebcams(
  data: PopupVideoBootstrapStorageData,
  webcamsPromise: Promise<WebcamOption[]>
): Promise<WebcamOption[]> {
  const webcams = await webcamsPromise;
  if (!data.storedVideoSettings.webcamEnabled) {
    return webcams;
  }

  return loadWebcamDevices({
    knownDevices: webcams,
    hydrateLabels: 'if-permission-granted',
    preferredDeviceId: data.storedVideoSettings.webcamDeviceId ?? null,
  });
}

function buildPopupBootstrapVideoData(
  data: PopupVideoBootstrapStorageData,
  microphones: MicrophoneOption[],
  webcams: WebcamOption[]
): PopupBootstrapVideoData {
  const { settings, storedVideoSettings, storedVideoUiState } = data;
  const viewportPresets = settings.viewportPresets ?? [];
  const rawPresetId = storedVideoUiState.viewportPresetId ?? null;
  const selectedPresetId = viewportPresets.some((preset) => preset.id === rawPresetId)
    ? rawPresetId
    : null;
  const captureMode =
    storedVideoUiState.captureMode === CaptureMode.VIEWPORT_EMULATION
      ? CaptureMode.TAB
      : storedVideoUiState.captureMode;

  return {
    captureMode,
    microphones,
    webcams,
    selectedPresetId,
    videoSettings: {
      ...storedVideoSettings,
      microphoneDeviceId: resolveMicrophoneDeviceId(
        storedVideoSettings.microphoneDeviceId,
        microphones
      ),
      webcamDeviceId: resolveWebcamDeviceId(storedVideoSettings.webcamDeviceId ?? null, webcams),
    },
    viewportPresets,
  };
}
