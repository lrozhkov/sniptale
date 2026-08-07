import { applyPermissionState, type PermissionInfo } from '../../../permissions-lib';

import type { PermissionSetter } from '../../types';

export function createMarkPermissionGranted(setPermissions: PermissionSetter) {
  return (matcher: (permission: PermissionInfo) => boolean) => {
    setPermissions((currentPermissions) =>
      applyPermissionState(currentPermissions, matcher, 'granted')
    );
  };
}
