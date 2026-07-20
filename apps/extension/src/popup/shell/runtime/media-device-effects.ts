import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { resolveMicrophoneDeviceId, type MicrophoneOption } from '../../recording/microphone';
import type { RefreshMicrophoneDevicesOptions } from '../../recording/microphone-flow';
import { resolveWebcamDeviceId, type WebcamOption } from '../../recording/webcam';
import type { RefreshWebcamDevicesOptions } from '../../recording/webcam-flow';

type DeviceSettingsKey = 'microphoneDeviceId' | 'webcamDeviceId';

export function usePopupMediaDeviceEffects({
  microphoneDevices,
  refreshMicrophones,
  refreshWebcams,
  setVideoSettings,
  webcamDevices,
}: {
  microphoneDevices: MicrophoneOption[];
  refreshMicrophones: (options?: RefreshMicrophoneDevicesOptions) => Promise<MicrophoneOption[]>;
  refreshWebcams: (options?: RefreshWebcamDevicesOptions) => Promise<WebcamOption[]>;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  webcamDevices: WebcamOption[];
}) {
  useDeviceChangeRefresh(refreshMicrophones, refreshWebcams);
  useDeviceIdCorrection(
    'microphoneDeviceId',
    microphoneDevices,
    resolveMicrophoneDeviceId,
    setVideoSettings
  );
  useDeviceIdCorrection('webcamDeviceId', webcamDevices, resolveWebcamDeviceId, setVideoSettings);
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

function useDeviceIdCorrection<TDevice extends { deviceId: string }>(
  key: DeviceSettingsKey,
  devices: TDevice[],
  resolveDeviceId: (currentId: string | null, devices: TDevice[]) => string | null,
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>
) {
  useEffect(() => {
    setVideoSettings((previous) => {
      const resolvedDeviceId = resolveDeviceId(previous[key] ?? null, devices);
      return resolvedDeviceId === previous[key]
        ? previous
        : { ...previous, [key]: resolvedDeviceId };
    });
  }, [devices, key, resolveDeviceId, setVideoSettings]);
}
