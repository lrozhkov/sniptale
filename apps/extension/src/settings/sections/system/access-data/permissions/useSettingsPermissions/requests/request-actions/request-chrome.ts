import { requestChromePermission, type PermissionInfo } from '../../../permissions-lib';

import { createMarkPermissionGranted } from './grant-permission';
import type { PermissionSetter } from '../../types';

export function createRequestChromeAction(setPermissions: PermissionSetter) {
  const markPermissionGranted = createMarkPermissionGranted(setPermissions);

  return async function requestChrome(permission: PermissionInfo) {
    const granted = await requestChromePermission(permission.chromePermission!);
    if (granted) {
      markPermissionGranted((item) => item.chromePermission === permission.chromePermission);
    }
    return granted;
  };
}
