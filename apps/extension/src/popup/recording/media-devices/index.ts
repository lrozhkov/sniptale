import { translate, type TranslationKey } from '../../../platform/i18n';

export type PopupMediaDeviceOption = {
  deviceId: string;
  label: string;
};

export type PopupMediaDeviceKind = 'audioinput' | 'videoinput';
export type PopupMediaPermissionName = 'microphone' | 'camera';

export type LoadPopupMediaDevicesOptions = {
  knownDevices?: PopupMediaDeviceOption[];
  hydrateLabels?: 'never' | 'if-permission-granted' | 'always';
  preferredDeviceId?: string | null;
};

export type PopupMediaDeviceConfig = {
  kind: PopupMediaDeviceKind;
  permissionName: PopupMediaPermissionName;
  fallbackLabelKey: TranslationKey;
  createConstraints: (deviceId?: string | null) => MediaStreamConstraints;
};

type MediaPermissionState = 'granted' | 'denied' | 'prompt';

export async function requestPopupMediaDevicePermission(
  config: PopupMediaDeviceConfig,
  deviceId?: string | null
): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia(config.createConstraints(deviceId));
  stopMediaStreamTracks(stream);
}

export async function loadPopupMediaDevices(
  config: PopupMediaDeviceConfig,
  options: LoadPopupMediaDevicesOptions = {}
): Promise<PopupMediaDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const filteredDevices = mapPopupMediaDevices(config, devices, options.knownDevices);

  if (!shouldHydrateMediaDeviceLabels(config.kind, devices, options.hydrateLabels)) {
    return filteredDevices;
  }

  if (
    options.hydrateLabels === 'if-permission-granted' &&
    !(await hasGrantedMediaPermission(config.permissionName))
  ) {
    return filteredDevices;
  }

  const hydratedDevices = await enumerateDevicesWithActiveMedia(config, options.preferredDeviceId);
  if (!hydratedDevices) {
    return filteredDevices;
  }

  return mapPopupMediaDevices(config, hydratedDevices, filteredDevices);
}

export function resolvePopupMediaDeviceId(
  currentId: string | null,
  devices: PopupMediaDeviceOption[]
): string | null {
  const [firstDevice] = devices;
  if (devices.length === 0) {
    return null;
  }

  if (currentId && devices.some((device) => device.deviceId === currentId)) {
    return currentId;
  }

  return firstDevice?.deviceId ?? null;
}

function mapPopupMediaDevices(
  config: PopupMediaDeviceConfig,
  devices: MediaDeviceInfo[],
  knownDevices: PopupMediaDeviceOption[] = []
): PopupMediaDeviceOption[] {
  const knownLabels = new Map(knownDevices.map((device) => [device.deviceId, device.label]));

  return devices
    .filter((device) => device.kind === config.kind)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label:
        device.label ||
        knownLabels.get(device.deviceId) ||
        `${translate(config.fallbackLabelKey)} ${index + 1}`,
    }));
}

function shouldHydrateMediaDeviceLabels(
  kind: PopupMediaDeviceKind,
  devices: MediaDeviceInfo[],
  hydrateLabels: LoadPopupMediaDevicesOptions['hydrateLabels'] = 'never'
): boolean {
  if (hydrateLabels === 'never') {
    return false;
  }

  const matchingDevices = devices.filter((device) => device.kind === kind);
  return matchingDevices.length === 0 || matchingDevices.some((device) => !device.label);
}

async function hasGrantedMediaPermission(
  permissionName: PopupMediaPermissionName
): Promise<boolean> {
  const permissions = navigator.permissions;
  if (!permissions?.query) {
    return false;
  }

  try {
    const status = await permissions.query({ name: permissionName as PermissionName });
    return (status.state as MediaPermissionState) === 'granted';
  } catch {
    return false;
  }
}

async function enumerateDevicesWithActiveMedia(
  config: PopupMediaDeviceConfig,
  preferredDeviceId?: string | null
): Promise<MediaDeviceInfo[] | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  let stream: MediaStream | null = null;

  try {
    stream = await openMediaEnumerationStream(config, preferredDeviceId);
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return null;
  } finally {
    if (stream) {
      stopMediaStreamTracks(stream);
    }
  }
}

async function openMediaEnumerationStream(
  config: PopupMediaDeviceConfig,
  preferredDeviceId?: string | null
): Promise<MediaStream> {
  if (!preferredDeviceId) {
    return navigator.mediaDevices.getUserMedia(config.createConstraints());
  }

  try {
    return await navigator.mediaDevices.getUserMedia(config.createConstraints(preferredDeviceId));
  } catch (error) {
    if (!isRecoverableDeviceSelectionError(error)) {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia(config.createConstraints());
  }
}

function isRecoverableDeviceSelectionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError' ||
      error.name === 'OverconstrainedError')
  );
}

function stopMediaStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
