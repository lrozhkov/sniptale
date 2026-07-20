import {
  loadPopupMediaDevices,
  requestPopupMediaDevicePermission,
  resolvePopupMediaDeviceId,
  type LoadPopupMediaDevicesOptions,
  type PopupMediaDeviceConfig,
  type PopupMediaDeviceOption,
} from '../media-devices/index';

export type WebcamOption = PopupMediaDeviceOption;

export type LoadWebcamDevicesOptions = {
  knownDevices?: WebcamOption[];
  hydrateLabels?: 'never' | 'if-permission-granted' | 'always';
  preferredDeviceId?: string | null;
};

function createWebcamConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

const WEBCAM_MEDIA_DEVICE: PopupMediaDeviceConfig = {
  kind: 'videoinput',
  permissionName: 'camera',
  fallbackLabelKey: 'popup.video.webcamToggleLabel',
  createConstraints: (deviceId) => ({
    video: createWebcamConstraints(deviceId),
    audio: false,
  }),
};

export async function requestWebcamPermission(deviceId?: string | null): Promise<void> {
  await requestPopupMediaDevicePermission(WEBCAM_MEDIA_DEVICE, deviceId);
}

export async function loadWebcamDevices(
  options: LoadWebcamDevicesOptions = {}
): Promise<WebcamOption[]> {
  return loadPopupMediaDevices(WEBCAM_MEDIA_DEVICE, options as LoadPopupMediaDevicesOptions);
}

export function resolveWebcamDeviceId(
  currentId: string | null,
  devices: WebcamOption[]
): string | null {
  return resolvePopupMediaDeviceId(currentId, devices);
}
