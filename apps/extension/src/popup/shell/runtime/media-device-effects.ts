import { useEffect } from 'react';
import type { MicrophoneOption } from '../../recording/microphone';
import type { RefreshMicrophoneDevicesOptions } from '../../recording/microphone-flow';
import type { WebcamOption } from '../../recording/webcam';
import type { RefreshWebcamDevicesOptions } from '../../recording/webcam-flow';

export function usePopupMediaDeviceEffects({
  refreshMicrophones,
  refreshWebcams,
}: {
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
}) {
  useDeviceChangeRefresh(refreshMicrophones, refreshWebcams);
}

function useDeviceChangeRefresh(
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>,
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>
) {
  useEffect(() => {
    const handleDeviceChange = () => {
      void refreshMicrophones();
      void refreshWebcams();
    };

    if (!navigator.mediaDevices?.addEventListener) {
      return undefined;
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    void refreshMicrophones();
    void refreshWebcams();
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshMicrophones, refreshWebcams]);
}
