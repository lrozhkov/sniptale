import type { PermissionInfo } from '../../permissions-lib';

type PermissionRequestHandlers = {
  requestCamera: () => Promise<boolean>;
  requestChrome: (permission: PermissionInfo) => Promise<boolean>;
  requestFileScheme: (permission: PermissionInfo) => Promise<boolean>;
  requestMicrophone: () => Promise<boolean>;
  requestOrigin: (permission: PermissionInfo) => Promise<boolean>;
};

export async function requestTypedPermission(
  permission: PermissionInfo,
  handlers: PermissionRequestHandlers
) {
  if (permission.type === 'web' && permission.id === 'microphone') {
    return handlers.requestMicrophone();
  }

  if (permission.type === 'web' && permission.id === 'camera') {
    return handlers.requestCamera();
  }

  if (permission.type === 'chrome' && permission.chromePermission) {
    return handlers.requestChrome(permission);
  }

  if (
    permission.type === 'origin' &&
    (permission.originPattern || permission.originPatterns?.length)
  ) {
    return handlers.requestOrigin(permission);
  }

  if (permission.type === 'file' && permission.originPattern) {
    return handlers.requestFileScheme(permission);
  }

  return false;
}
