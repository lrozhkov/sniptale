import {
  applyPermissionState,
  requestCameraPermission,
  requestMicrophonePermission,
} from '../../../permissions-lib';

import type { PermissionSetter } from '../../types';

export function createRequestWebMediaAction(
  permissionId: 'camera' | 'microphone',
  setPermissions: PermissionSetter
) {
  return async function requestWebMedia() {
    const state =
      permissionId === 'camera'
        ? await requestCameraPermission()
        : await requestMicrophonePermission();
    setPermissions((currentPermissions) =>
      applyPermissionState(currentPermissions, (item) => item.id === permissionId, state)
    );
    return state === 'granted';
  };
}
