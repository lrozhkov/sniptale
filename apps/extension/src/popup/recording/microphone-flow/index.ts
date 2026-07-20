import { translate } from '../../../platform/i18n';
import type { Dispatch, SetStateAction } from 'react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { refreshPopupMediaDevices, togglePopupMediaDevice } from '../media-device-flow/index';
import {
  resolveMicrophoneDeviceId,
  loadMicrophoneDevices,
  type LoadMicrophoneDevicesOptions,
} from '../microphone/index';
import type { MicrophoneOption } from '../microphone/index';

const logger = createLogger({ namespace: 'PopupMicrophones' });
const MICROPHONE_REFRESH_OWNER = Symbol('popup-microphone-refresh');

export type RefreshMicrophoneDevicesOptions = Pick<
  LoadMicrophoneDevicesOptions,
  'hydrateLabels' | 'preferredDeviceId'
>;

export async function refreshMicrophoneDevices(
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>,
  currentDevices: MicrophoneOption[],
  options: RefreshMicrophoneDevicesOptions = {}
): Promise<MicrophoneOption[]> {
  return refreshPopupMediaDevices({
    refreshOwner: MICROPHONE_REFRESH_OWNER,
    setIsLoading,
    setDevices: setMicrophoneDevices,
    currentDevices,
    loadDevices: (loaderOptions) =>
      loadMicrophoneDevices({
        ...loaderOptions,
        ...options,
      }),
    onError: (error) => {
      logger.error('Failed to load microphones', error);
    },
  });
}

type ToggleMicrophoneParams = {
  videoSettings: VideoRecordingSettings;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
};

export async function toggleMicrophone(params: ToggleMicrophoneParams): Promise<void> {
  const { videoSettings, setVideoSettings, setStartError, refreshMicrophones } = params;

  await togglePopupMediaDevice({
    videoSettings,
    setVideoSettings,
    setStartError,
    refreshDevices: () =>
      refreshMicrophones({
        hydrateLabels: 'always',
        preferredDeviceId: videoSettings.microphoneDeviceId,
      }),
    enabledKey: 'microphoneEnabled',
    deviceIdKey: 'microphoneDeviceId',
    noDevicesError: translate('popup.video.noMicrophonesError'),
    accessError: translate('popup.video.microphoneAccessError'),
    resolveDeviceId: resolveMicrophoneDeviceId,
  });
}
