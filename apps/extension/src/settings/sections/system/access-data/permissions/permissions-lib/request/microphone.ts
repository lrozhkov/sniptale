import type { PermissionState } from '../types';
import {
  readMicrophoneAccessState,
  requestMicrophoneAccess,
} from '@sniptale/platform/browser/user-media';

export async function requestMicrophonePermission(): Promise<PermissionState> {
  const state = await requestMicrophoneAccess();
  if (state === 'denied') {
    const observed = await readMicrophoneAccessState();
    return observed === 'denied' ? 'denied' : 'prompt';
  }
  if (state === 'granted' || state === 'prompt') return state;
  return state === 'unavailable' ? 'error' : 'prompt';
}
