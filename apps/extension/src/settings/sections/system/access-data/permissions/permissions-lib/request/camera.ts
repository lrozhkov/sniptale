import type { PermissionState } from '../types';

export async function requestCameraPermission(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return 'prompt';
    try {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return status.state === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'prompt';
    }
  }
}
