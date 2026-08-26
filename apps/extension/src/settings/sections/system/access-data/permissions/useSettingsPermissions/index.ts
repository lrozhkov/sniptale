import { useCallback, useState } from 'react';

import { initialPermissions, type PermissionInfo } from '../permissions-lib';

import { usePermissionListeners } from './listeners';
import { usePermissionRefresh } from './refresh';
import { usePermissionRevokes } from './requests/use-permission-revokes';
import { usePermissionRequests } from './requests/use-permission-requests';

/**
 * Owns settings permission state, refresh, and request flows for the settings surface.
 */
export function useSettingsPermissions() {
  const [permissions, setPermissions] = useState<PermissionInfo[]>(initialPermissions);
  const runPermissionRefresh = usePermissionRefresh(setPermissions);
  const refreshPermissions = useCallback(
    () => runPermissionRefresh(permissions),
    [permissions, runPermissionRefresh]
  );
  const requestPermission = usePermissionRequests(permissions, setPermissions);
  const revokePermission = usePermissionRevokes(permissions, setPermissions);

  usePermissionListeners(runPermissionRefresh, setPermissions);

  return { permissions, refreshPermissions, requestPermission, revokePermission };
}
