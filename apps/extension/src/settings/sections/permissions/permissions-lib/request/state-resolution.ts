import type { PermissionInfo, PermissionState } from '../types';
import { initialPermissions } from '../types';
import { browserDownloads } from '@sniptale/platform/browser/downloads';
import {
  containsChromePermission,
  containsOriginPermission,
  containsOriginPermissions,
} from './browser-permissions';

type BrowserDownloadsApi = {
  isAvailable(): boolean;
};

const downloadsApi = browserDownloads as BrowserDownloadsApi;

async function getWebPermissionState(
  permissionName: 'camera' | 'microphone'
): Promise<PermissionState> {
  return navigator.permissions
    .query({ name: permissionName as PermissionName })
    .then((status) => status.state)
    .catch(() => 'error');
}

async function checkChromePermissionState(permission: PermissionInfo): Promise<PermissionState> {
  if (permission.chromePermission === 'clipboardWrite') {
    if (!navigator.clipboard?.write) {
      return 'prompt';
    }

    return (await containsChromePermission('clipboardWrite')) ? 'granted' : 'prompt';
  }

  if (permission.chromePermission === 'downloads') {
    if (!downloadsApi.isAvailable()) {
      return 'prompt';
    }

    return (await containsChromePermission('downloads')) ? 'granted' : 'prompt';
  }

  if (!permission.chromePermission) {
    return 'unknown';
  }

  return (await containsChromePermission(permission.chromePermission)) ? 'granted' : 'prompt';
}

async function checkPermissionState(permission: PermissionInfo): Promise<PermissionState> {
  try {
    if (
      permission.type === 'web' &&
      (permission.id === 'microphone' || permission.id === 'camera')
    ) {
      return await getWebPermissionState(permission.id);
    }

    if (permission.type === 'origin') {
      if (permission.originPatterns) {
        return (await containsOriginPermissions(permission.originPatterns)) ? 'granted' : 'prompt';
      }

      if (permission.originPattern) {
        return (await containsOriginPermission(permission.originPattern)) ? 'granted' : 'prompt';
      }
    }

    if (permission.type === 'chrome') {
      return await checkChromePermissionState(permission);
    }
  } catch {
    return 'error';
  }

  return 'unknown';
}

export async function readPermissionsSnapshot(
  permissions: PermissionInfo[] = initialPermissions
): Promise<PermissionInfo[]> {
  return Promise.all(
    permissions.map(async (permission) => ({
      ...permission,
      state: await checkPermissionState(permission),
    }))
  );
}
