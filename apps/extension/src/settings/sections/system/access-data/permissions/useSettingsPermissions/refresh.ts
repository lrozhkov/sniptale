import { useCallback, useEffect, useRef } from 'react';

import { readPermissionsSnapshot, type PermissionInfo } from '../permissions-lib';

import type { PermissionSetter } from './types';
import { registerEffectiveFileSchemeAccess } from './requests/request-actions/request-origin';

async function synchronizeFileSchemeRegistration(
  snapshot: PermissionInfo[]
): Promise<PermissionInfo[]> {
  const filePermission = snapshot.find((permission) => permission.type === 'file');
  if (!filePermission) {
    return snapshot;
  }

  try {
    const effective = await registerEffectiveFileSchemeAccess();
    if (filePermission.state !== 'granted' || effective) {
      return snapshot;
    }
  } catch {
    // Surface registration failure through the permission state below.
  }

  return snapshot.map((permission) =>
    permission.id === filePermission.id ? { ...permission, state: 'error' } : permission
  );
}

async function readSynchronizedPermissionsSnapshot(
  permissions?: PermissionInfo[]
): Promise<PermissionInfo[]> {
  const snapshot = await readPermissionsSnapshot(permissions);
  return synchronizeFileSchemeRegistration(snapshot);
}

export function usePermissionRefresh(setPermissions: PermissionSetter) {
  const generationRef = useRef(0);

  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    []
  );

  return useCallback(
    async (permissions?: PermissionInfo[]) => {
      const generation = ++generationRef.current;
      const snapshot = await readSynchronizedPermissionsSnapshot(permissions);
      if (generation === generationRef.current) {
        setPermissions(snapshot);
      }
    },
    [setPermissions]
  );
}
