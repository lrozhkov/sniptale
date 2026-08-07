import { useEffect } from 'react';

import {
  readPermissionsSnapshot,
  subscribeToPermissionChanges,
  syncWebPermissionStatus,
} from '../permissions-lib';

import type { PermissionSetter } from './types';

export function usePermissionListeners(setPermissions: PermissionSetter) {
  useEffect(() => {
    let mounted = true;
    let micPermissionStatus: PermissionStatus | null = null;
    let cameraPermissionStatus: PermissionStatus | null = null;

    const refreshPermissions = () => {
      void readPermissionsSnapshot().then(setPermissions);
    };

    refreshPermissions();

    const handlePermissionChange = () => {
      refreshPermissions();
    };

    void setupWebPermissionListener(
      'microphone',
      (status) => {
        micPermissionStatus = status;
      },
      () => mounted,
      setPermissions
    );
    void setupWebPermissionListener(
      'camera',
      (status) => {
        cameraPermissionStatus = status;
      },
      () => mounted,
      setPermissions
    );
    const unsubscribePermissionChanges = subscribeToPermissionChanges(handlePermissionChange);

    return () => {
      mounted = false;
      unsubscribePermissionChanges();
      clearWebPermissionStatus(micPermissionStatus);
      clearWebPermissionStatus(cameraPermissionStatus);
    };
  }, [setPermissions]);
}

async function setupWebPermissionListener(
  permissionId: 'camera' | 'microphone',
  assignStatus: (status: PermissionStatus | null) => void,
  isMounted: () => boolean,
  setPermissions: PermissionSetter
) {
  try {
    const status = await navigator.permissions.query({ name: permissionId as PermissionName });
    if (!isMounted()) {
      status.onchange = null;
      return;
    }
    assignStatus(status);
    syncWebPermissionStatus(permissionId, status, setPermissions);
  } catch {
    assignStatus(null);
  }
}

function clearWebPermissionStatus(status: PermissionStatus | null) {
  if (status) {
    status.onchange = null;
  }
}
