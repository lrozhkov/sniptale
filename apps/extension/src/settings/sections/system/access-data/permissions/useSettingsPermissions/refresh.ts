import { useCallback } from 'react';

import { readPermissionsSnapshot, type PermissionInfo } from '../permissions-lib';

import type { PermissionSetter } from './types';

export function usePermissionRefresh(
  permissions: PermissionInfo[],
  setPermissions: PermissionSetter
) {
  return useCallback(async () => {
    setPermissions(await readPermissionsSnapshot(permissions));
  }, [permissions, setPermissions]);
}
