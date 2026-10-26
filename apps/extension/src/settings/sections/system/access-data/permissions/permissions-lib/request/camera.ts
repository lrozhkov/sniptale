import type { PermissionState } from '../types';

type CameraAccessState = PermissionState | 'no-device' | 'device-busy' | 'unavailable';

/** Reports acquisition failures without treating a missing or busy camera as permission state. */
export async function requestCameraAccess(): Promise<CameraAccessState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    if (!(error instanceof DOMException)) return 'unavailable';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'no-device';
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'device-busy';
    if (error.name !== 'NotAllowedError') return 'unavailable';
    try {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return status.state === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'prompt';
    }
  }
}

/** Preserves the permission-only contract used by the existing permissions page. */
export async function requestCameraPermission(): Promise<PermissionState> {
  const access = await requestCameraAccess();
  return access === 'no-device' || access === 'device-busy' || access === 'unavailable'
    ? 'prompt'
    : access;
}
