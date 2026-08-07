import type { PermissionSetter } from '../../types';
import { createRequestWebMediaAction } from './request-web-media';

export function createRequestMicrophoneAction(setPermissions: PermissionSetter) {
  return createRequestWebMediaAction('microphone', setPermissions);
}
