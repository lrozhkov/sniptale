import { useEffect, useRef } from 'react';
import type { MicrophoneOption } from '../../recording/microphone';
import type { RefreshMicrophoneDevicesOptions } from '../../recording/microphone-flow';
import type { WebcamOption } from '../../recording/webcam';
import type { RefreshWebcamDevicesOptions } from '../../recording/webcam-flow';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupPage } from '../navigation/actions';

export function usePopupMediaDeviceEffects({
  refreshMicrophones,
  refreshWebcams,
  page,
  videoSettings,
}: {
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
  page: PopupPage;
  videoSettings: VideoRecordingSettings;
}) {
  useDeviceChangeRefresh(page, videoSettings, refreshMicrophones, refreshWebcams);
}

function useDeviceChangeRefresh(
  page: PopupPage,
  videoSettings: VideoRecordingSettings,
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>,
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>
) {
  const videoSettingsRef = useRef(videoSettings);
  videoSettingsRef.current = videoSettings;

  useEffect(() => {
    if (page !== 'video') return undefined;

    const refreshDevices = () => {
      const current = videoSettingsRef.current;
      const microphoneOptions: RefreshMicrophoneDevicesOptions = current.microphoneEnabled
        ? {
            hydrateLabels: 'if-permission-granted',
            preferredDeviceId: current.microphoneDeviceId,
          }
        : { preferredDeviceId: current.microphoneDeviceId };
      const webcamOptions: RefreshWebcamDevicesOptions = current.webcamEnabled
        ? {
            hydrateLabels: 'if-permission-granted',
            preferredDeviceId: current.webcamDeviceId ?? null,
          }
        : { preferredDeviceId: current.webcamDeviceId ?? null };
      void refreshMicrophones(microphoneOptions);
      void refreshWebcams(webcamOptions);
    };
    const handleDeviceChange = () => {
      refreshDevices();
    };

    if (!navigator.mediaDevices?.addEventListener) {
      return undefined;
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    refreshDevices();
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [page, refreshMicrophones, refreshWebcams]);
}
