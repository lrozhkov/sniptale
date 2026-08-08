import { useCallback } from 'react';

import {
  applyPermissionState,
  removeOriginPermissions,
  type PermissionInfo,
} from '../../permissions-lib';
import { findPermissionById } from './find';
import type { PermissionSetter } from '../types';

export function usePermissionRevokes(
  permissions: PermissionInfo[],
  setPermissions: PermissionSetter
) {
  return useCallback(
    async (permissionId: string): Promise<boolean> => {
      const permission = findPermissionById(permissions, permissionId);
      if (!permission?.originPatterns?.length) {
        return false;
      }

      const removed = await removeOriginPermissions(permission.originPatterns);
      if (removed) {
        setPermissions((currentPermissions) =>
          applyPermissionState(currentPermissions, (item) => item.id === permission.id, 'prompt')
        );
      }

      return removed;
    },
    [permissions, setPermissions]
  );
}
