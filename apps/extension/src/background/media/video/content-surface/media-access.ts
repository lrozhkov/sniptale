import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export async function hasRecordingMediaAccess(kind: 'audioinput' | 'videoinput'): Promise<boolean> {
  try {
    const name = kind === 'audioinput' ? 'microphone' : 'camera';
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export async function resolveRecordingMediaAccess(settings: VideoRecordingSettings) {
  const [microphone, camera] = await Promise.all([
    settings.microphoneEnabled ? hasRecordingMediaAccess('audioinput') : false,
    settings.webcamEnabled ? hasRecordingMediaAccess('videoinput') : false,
  ]);
  return { ...settings, microphoneEnabled: microphone, webcamEnabled: camera };
}
