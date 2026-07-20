import type { PermissionInfo } from '../../permissions-lib';

export async function requestTypedPermission(
  permission: PermissionInfo,
  requestMicrophone: () => Promise<boolean>,
  requestCamera: () => Promise<boolean>,
  requestChrome: (permission: PermissionInfo) => Promise<boolean>,
  requestOrigin: (permission: PermissionInfo) => Promise<boolean>
) {
  if (permission.type === 'web' && permission.id === 'microphone') {
    return requestMicrophone();
  }

  if (permission.type === 'web' && permission.id === 'camera') {
    return requestCamera();
  }

  if (permission.type === 'chrome' && permission.chromePermission) {
    return requestChrome(permission);
  }

  if (
    permission.type === 'origin' &&
    (permission.originPattern || permission.originPatterns?.length)
  ) {
    return requestOrigin(permission);
  }

  return false;
}
