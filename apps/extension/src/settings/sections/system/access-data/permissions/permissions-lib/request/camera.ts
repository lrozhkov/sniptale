import type { PermissionState } from '../types';

export async function requestCameraPermission(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return (error as DOMException).name === 'NotAllowedError' ? 'denied' : 'prompt';
  }
}
