import { useCallback } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { PermissionInfo } from '../../permissions-lib';

import { findPermissionById } from './find';
import { requestTypedPermission } from './dispatch';
import { usePermissionRequestActions } from './request-actions/use-permission-request-actions';

import type { PermissionSetter } from '../types';

const logger = createLogger({ namespace: 'SettingsPermissions' });

export function usePermissionRequests(
  permissions: PermissionInfo[],
  setPermissions: PermissionSetter
) {
  const { requestMicrophone, requestCamera, requestChrome, requestOrigin } =
    usePermissionRequestActions(setPermissions);

  return useCallback(
    async (permissionId: string): Promise<boolean> => {
      const permission = findPermissionById(permissions, permissionId);

      if (!permission) {
        return false;
      }

      try {
        return await requestTypedPermission(
          permission,
          requestMicrophone,
          requestCamera,
          requestChrome,
          requestOrigin
        );
      } catch (error) {
        logger.error('Failed to request settings permission', error);
      }

      return false;
    },
    [permissions, requestCamera, requestChrome, requestMicrophone, requestOrigin]
  );
}
