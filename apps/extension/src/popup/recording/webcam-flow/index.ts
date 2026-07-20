import { translate } from '../../../platform/i18n';
import type { Dispatch, SetStateAction } from 'react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { refreshPopupMediaDevices, togglePopupMediaDevice } from '../media-device-flow/index';
import {
  loadWebcamDevices,
  resolveWebcamDeviceId,
  type LoadWebcamDevicesOptions,
  type WebcamOption,
} from '../webcam/index';

const logger = createLogger({ namespace: 'PopupWebcams' });
const WEBCAM_REFRESH_OWNER = Symbol('popup-webcam-refresh');

export type RefreshWebcamDevicesOptions = Pick<
  LoadWebcamDevicesOptions,
  'hydrateLabels' | 'preferredDeviceId'
>;

export async function refreshWebcamDevices(
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>,
  currentDevices: WebcamOption[],
  options: RefreshWebcamDevicesOptions = {}
): Promise<WebcamOption[]> {
  return refreshPopupMediaDevices({
    refreshOwner: WEBCAM_REFRESH_OWNER,
    setIsLoading,
    setDevices: setWebcamDevices,
    currentDevices,
    loadDevices: (loaderOptions) =>
      loadWebcamDevices({
        ...loaderOptions,
        ...options,
      }),
    onError: (error) => {
      logger.error('Failed to load webcams', error);
    },
  });
}

type ToggleWebcamParams = {
  videoSettings: VideoRecordingSettings;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
};

export async function toggleWebcam(params: ToggleWebcamParams): Promise<void> {
  const { videoSettings, setVideoSettings, setStartError, refreshWebcams } = params;

  await togglePopupMediaDevice({
    videoSettings,
    setVideoSettings,
    setStartError,
    refreshDevices: () =>
      refreshWebcams({
        hydrateLabels: 'always',
        preferredDeviceId: videoSettings.webcamDeviceId ?? null,
      }),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: translate('popup.video.noWebcamsError'),
    accessError: translate('popup.video.webcamAccessError'),
    resolveDeviceId: resolveWebcamDeviceId,
  });
}
