import {
  loadPopupMediaDevices,
  requestPopupMediaDevicePermission,
  resolvePopupMediaDeviceId,
  type LoadPopupMediaDevicesOptions,
  type PopupMediaDeviceConfig,
  type PopupMediaDeviceOption,
} from '../media-devices/index';

export type MicrophoneOption = PopupMediaDeviceOption;

export type LoadMicrophoneDevicesOptions = {
  knownDevices?: MicrophoneOption[];
  hydrateLabels?: 'never' | 'if-permission-granted' | 'always';
  preferredDeviceId?: string | null;
};

/**
 * Builds audio constraints for microphone access and recording setup.
 */
function createMicrophoneConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

const MICROPHONE_MEDIA_DEVICE: PopupMediaDeviceConfig = {
  kind: 'audioinput',
  permissionName: 'microphone',
  fallbackLabelKey: 'popup.video.microphoneToggleLabel',
  createConstraints: (deviceId) => ({
    audio: createMicrophoneConstraints(deviceId),
  }),
};

/**
 * Requests microphone permission for the selected device and releases the stream immediately.
 */
export async function requestMicrophonePermission(deviceId?: string | null): Promise<void> {
  await requestPopupMediaDevicePermission(MICROPHONE_MEDIA_DEVICE, deviceId);
}

/**
 * Enumerates available microphones and hydrates human-readable labels when the caller allows it.
 */
export async function loadMicrophoneDevices(
  options: LoadMicrophoneDevicesOptions = {}
): Promise<MicrophoneOption[]> {
  return loadPopupMediaDevices(MICROPHONE_MEDIA_DEVICE, options as LoadPopupMediaDevicesOptions);
}

/**
 * Resolves the effective microphone device id against the currently available device list.
 */
export function resolveMicrophoneDeviceId(
  currentId: string | null,
  devices: MicrophoneOption[]
): string | null {
  return resolvePopupMediaDeviceId(currentId, devices);
}
