import type { PermissionInfo, PermissionState } from '../types';
import { initialPermissions } from '../types';
import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { hasLocalFileAccessOptIn } from '../../../../../../../composition/persistence/settings/file-scheme-consent';
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

async function checkFileSchemePermissionState(
  permission: PermissionInfo
): Promise<PermissionState> {
  if (!permission.originPattern) {
    return 'unknown';
  }

  const [optedIn, originGranted, browserAccessAllowed] = await Promise.all([
    hasLocalFileAccessOptIn(),
    containsOriginPermission(permission.originPattern),
    browserPermissions.isFileSchemeAccessAllowed(),
  ]);
  return optedIn && originGranted && browserAccessAllowed ? 'granted' : 'prompt';
}

async function checkOriginPermissionState(permission: PermissionInfo): Promise<PermissionState> {
  if (permission.originPatterns) {
    return (await containsOriginPermissions(permission.originPatterns)) ? 'granted' : 'prompt';
  }
  if (permission.originPattern) {
    return (await containsOriginPermission(permission.originPattern)) ? 'granted' : 'prompt';
  }
  return 'unknown';
}

async function checkPermissionState(permission: PermissionInfo): Promise<PermissionState> {
  try {
    switch (permission.type) {
      case 'web':
        return permission.id === 'microphone' || permission.id === 'camera'
          ? await getWebPermissionState(permission.id)
          : 'unknown';
      case 'origin':
        return await checkOriginPermissionState(permission);
      case 'file':
        return await checkFileSchemePermissionState(permission);
      case 'chrome':
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
