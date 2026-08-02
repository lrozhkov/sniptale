import type { PermissionState } from '../types';
import { requestMicrophoneAccess } from '@sniptale/platform/browser/user-media';

export async function requestMicrophonePermission(): Promise<PermissionState> {
  const state = await requestMicrophoneAccess();
  if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
  return state === 'unavailable' ? 'error' : 'prompt';
}
