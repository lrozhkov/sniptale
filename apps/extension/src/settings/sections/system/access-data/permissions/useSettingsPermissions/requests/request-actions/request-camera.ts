import type { PermissionSetter } from '../../types';
import { createRequestWebMediaAction } from './request-web-media';

export function createRequestCameraAction(setPermissions: PermissionSetter) {
  return createRequestWebMediaAction('camera', setPermissions);
}
