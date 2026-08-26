import { useCallback } from 'react';
import { setLocalFileAccessOptIn } from '../../../../../../../composition/persistence/settings/file-scheme-consent';

import {
  applyPermissionState,
  removeChromePermission,
  removeOriginPermissions,
  type PermissionInfo,
} from '../../permissions-lib';
import { findPermissionById } from './find';
import type { PermissionSetter } from '../types';
import { registerEffectiveFileSchemeAccess } from './request-actions/request-origin';

export function usePermissionRevokes(
  permissions: PermissionInfo[],
  setPermissions: PermissionSetter
) {
  return useCallback(
    async (permissionId: string): Promise<boolean> => {
      const permission = findPermissionById(permissions, permissionId);
      const originPatterns = permission?.originPatterns?.length
        ? permission.originPatterns
        : permission?.originPattern
          ? [permission.originPattern]
          : [];
      const chromePermission = permission?.chromePermission;
      if (!permission || (originPatterns.length === 0 && !chromePermission)) {
        return false;
      }

      if (permission.type === 'file') {
        await setLocalFileAccessOptIn(false);
      }
      let removed = false;
      let removalError: unknown;
      try {
        removed = chromePermission
          ? await removeChromePermission(chromePermission)
          : await removeOriginPermissions(originPatterns);
      } catch (error) {
        removalError = error;
      }
      const effectiveRemoval = permission.type === 'file' ? true : removed;
      let reconciliationError: unknown;
      if (permission.type === 'file') {
        try {
          await registerEffectiveFileSchemeAccess();
        } catch (error) {
          reconciliationError = error;
        }
      }
      if (removalError) {
        throw removalError;
      }
      if (reconciliationError) {
        throw reconciliationError;
      }
      if (effectiveRemoval) {
        setPermissions((currentPermissions) =>
          applyPermissionState(currentPermissions, (item) => item.id === permission.id, 'prompt')
        );
      }

      return effectiveRemoval;
    },
    [permissions, setPermissions]
  );
}
