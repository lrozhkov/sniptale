import { translate, type TranslationKey } from '../../../platform/i18n/popup';
import {
  readMicrophoneAccessState,
  requestMicrophoneAccess,
  subscribeToMicrophoneAccessChanges,
  type MicrophoneAccessState,
} from '@sniptale/platform/browser/user-media';

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
const pendingMediaPermissionRequests = new Map<
  PopupMediaPermissionName,
  {
    deviceId: string | null;
    request: Promise<void>;
  }
>();

export type PopupMediaAccessState = MicrophoneAccessState;

export class PopupMediaAccessError extends Error {
  constructor(
    readonly permissionName: PopupMediaPermissionName,
    readonly state: PopupMediaAccessState
  ) {
    super(`media-access:${permissionName}:${state}`);
    this.name = 'PopupMediaAccessError';
  }
}

export function getPopupMediaAccessErrorKey(error: unknown): TranslationKey | null {
  if (!(error instanceof PopupMediaAccessError)) return null;
  if (error.state === 'prompt') {
    return error.permissionName === 'microphone'
      ? 'popup.video.microphonePermissionRequired'
      : 'popup.video.cameraPermissionRequired';
  }
  if (error.state === 'denied') {
    return error.permissionName === 'microphone'
      ? 'popup.video.microphonePermissionDenied'
      : 'popup.video.cameraPermissionDenied';
  }
  if (error.state === 'no-device') {
    return error.permissionName === 'microphone'
      ? 'popup.video.noMicrophonesError'
      : 'popup.video.noWebcamsError';
  }
  if (error.state === 'device-busy') return 'popup.video.mediaDeviceBusy';
  if (error.state === 'unavailable') return 'popup.video.mediaAccessUnavailable';
  return 'popup.video.mediaAccessUnconfirmed';
}

export async function readPopupMediaAccessState(
  permissionName: PopupMediaPermissionName
): Promise<PopupMediaAccessState> {
  if (permissionName === 'microphone') return readMicrophoneAccessState();
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export async function subscribeToPopupMediaAccessChanges(
  permissionName: PopupMediaPermissionName,
  listener: (state: PopupMediaAccessState) => void
): Promise<() => void> {
  if (permissionName === 'microphone') return subscribeToMicrophoneAccessChanges(listener);
  try {
    if (!navigator.permissions?.query) return () => undefined;
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    const handleChange = () => listener(status.state);
    status.addEventListener('change', handleChange);
    return () => status.removeEventListener('change', handleChange);
  } catch {
    return () => undefined;
  }
}

function classifyMediaAccessFailure(error: unknown): PopupMediaAccessState {
  if (!(error instanceof DOMException)) return 'unknown';
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return 'denied';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'no-device';
  if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'device-busy';
  if (error.name === 'SecurityError' || error.name === 'TypeError') return 'unavailable';
  return 'unknown';
}

export async function requestPopupMediaDevicePermission(
  config: PopupMediaDeviceConfig,
  deviceId?: string | null
): Promise<void> {
  const pending = pendingMediaPermissionRequests.get(config.permissionName);
  if (pending) {
    if (pending.deviceId === (deviceId ?? null)) return pending.request;
    await pending.request.then(
      () => undefined,
      () => undefined
    );
    return requestPopupMediaDevicePermission(config, deviceId);
  }
  const request = acquirePopupMediaDevicePermission(config, deviceId);
  pendingMediaPermissionRequests.set(config.permissionName, {
    deviceId: deviceId ?? null,
    request,
  });
  try {
    await request;
  } finally {
    if (pendingMediaPermissionRequests.get(config.permissionName)?.request === request) {
      pendingMediaPermissionRequests.delete(config.permissionName);
    }
  }
}

async function acquirePopupMediaDevicePermission(
  config: PopupMediaDeviceConfig,
  deviceId?: string | null
): Promise<void> {
  if (config.permissionName === 'microphone') {
    const state = await requestMicrophoneAccess(deviceId || null);
    if (state !== 'granted') {
      const observed = state === 'denied' ? await readPopupMediaAccessState('microphone') : state;
      throw new PopupMediaAccessError('microphone', observed === 'prompt' ? 'prompt' : state);
    }
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new PopupMediaAccessError(config.permissionName, 'unavailable');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(config.createConstraints(deviceId));
    stopMediaStreamTracks(stream);
  } catch (error) {
    const state = classifyMediaAccessFailure(error);
    const observed =
      state === 'denied' ? await readPopupMediaAccessState(config.permissionName) : state;
    throw new PopupMediaAccessError(
      config.permissionName,
      observed === 'prompt' ? 'prompt' : state
    );
  }
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
