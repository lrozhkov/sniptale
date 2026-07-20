import type { PermissionState } from '../types';

export async function requestMicrophonePermission(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return (error as DOMException).name === 'NotAllowedError' ? 'denied' : 'prompt';
  }
}
