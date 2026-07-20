import type { Dispatch, SetStateAction } from 'react';

import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type { PermissionInfo, PermissionState } from './types';

type BrowserPermissionsApi = {
  subscribeToAdded(listener: () => void): () => void;
  subscribeToRemoved(listener: () => void): () => void;
};

const permissionsApi = browserPermissions as BrowserPermissionsApi;

export function applyPermissionState(
  permissions: PermissionInfo[],
  matcher: (permission: PermissionInfo) => boolean,
  state: PermissionState
): PermissionInfo[] {
  return permissions.map((permission) =>
    matcher(permission) ? { ...permission, state } : permission
  );
}

export function syncWebPermissionStatus(
  permissionId: 'camera' | 'microphone',
  status: PermissionStatus,
  setPermissions: Dispatch<SetStateAction<PermissionInfo[]>>
): void {
  status.onchange = () => {
    setPermissions((currentPermissions) =>
      applyPermissionState(
        currentPermissions,
        (permission) => permission.id === permissionId,
        status.state
      )
    );
  };
}

export function syncMicrophonePermissionStatus(
  status: PermissionStatus,
  setPermissions: Dispatch<SetStateAction<PermissionInfo[]>>
): void {
  syncWebPermissionStatus('microphone', status, setPermissions);
}

export function subscribeToPermissionChanges(listener: () => void): () => void {
  const unsubscribeAdded = permissionsApi.subscribeToAdded(() => listener());
  const unsubscribeRemoved = permissionsApi.subscribeToRemoved(() => listener());

  return () => {
    unsubscribeAdded();
    unsubscribeRemoved();
  };
}
