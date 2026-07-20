import type { Dispatch, SetStateAction } from 'react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupMediaDeviceOption } from '../media-devices/index';

type RefreshMediaDevicesParams<TDevice extends PopupMediaDeviceOption> = {
  refreshOwner: symbol;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setDevices: Dispatch<SetStateAction<TDevice[]>>;
  currentDevices: TDevice[];
  loadDevices: (options: { knownDevices: TDevice[] }) => Promise<TDevice[]>;
  onError: (error: unknown) => void;
};

const mediaDeviceRefreshSequences = new Map<symbol, number>();

function isCurrentRefresh(owner: symbol, sequence: number): boolean {
  return mediaDeviceRefreshSequences.get(owner) === sequence;
}

export async function refreshPopupMediaDevices<TDevice extends PopupMediaDeviceOption>({
  refreshOwner,
  setIsLoading,
  setDevices,
  currentDevices,
  loadDevices,
  onError,
}: RefreshMediaDevicesParams<TDevice>): Promise<TDevice[]> {
  const sequence = (mediaDeviceRefreshSequences.get(refreshOwner) ?? 0) + 1;
  mediaDeviceRefreshSequences.set(refreshOwner, sequence);
  setIsLoading(true);
  try {
    const devices = await loadDevices({ knownDevices: currentDevices });
    if (!isCurrentRefresh(refreshOwner, sequence)) {
      return [];
    }
    setDevices(devices);
    return devices;
  } catch (error) {
    if (!isCurrentRefresh(refreshOwner, sequence)) {
      return [];
    }
    onError(error);
    setDevices([]);
    return [];
  } finally {
    if (isCurrentRefresh(refreshOwner, sequence)) {
      setIsLoading(false);
    }
  }
}

type ToggleMediaDeviceParams<TDevice extends PopupMediaDeviceOption> = {
  videoSettings: VideoRecordingSettings;
  setVideoSettings: Dispatch<SetStateAction<VideoRecordingSettings>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
  refreshDevices: () => Promise<TDevice[]>;
  enabledKey: 'microphoneEnabled' | 'webcamEnabled';
  deviceIdKey: 'microphoneDeviceId' | 'webcamDeviceId';
  noDevicesError: string;
  accessError: string;
  resolveDeviceId: (currentId: string | null, devices: TDevice[]) => string | null;
};

export async function togglePopupMediaDevice<TDevice extends PopupMediaDeviceOption>(
  params: ToggleMediaDeviceParams<TDevice>
): Promise<void> {
  const {
    videoSettings,
    setVideoSettings,
    setStartError,
    refreshDevices,
    enabledKey,
    deviceIdKey,
    noDevicesError,
    accessError,
    resolveDeviceId,
  } = params;

  if (videoSettings[enabledKey]) {
    setVideoSettings((previous) => ({
      ...previous,
      [enabledKey]: false,
    }));
    return;
  }

  setStartError(null);

  try {
    const devices = await refreshDevices();

    if (devices.length === 0) {
      throw new Error(noDevicesError);
    }

    setVideoSettings((previous) => ({
      ...previous,
      [enabledKey]: true,
      [deviceIdKey]: resolveDeviceId(previous[deviceIdKey] ?? null, devices),
    }));
  } catch (error) {
    setStartError(error instanceof Error ? error.message : accessError);
  }
}
