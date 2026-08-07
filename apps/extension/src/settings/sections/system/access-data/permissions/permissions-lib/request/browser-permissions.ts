import { browserPermissions } from '@sniptale/platform/browser/permissions';

type BrowserPermissionsApi = {
  contains(query: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
  remove(query: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
  request(query: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
};

const permissionsApi = browserPermissions as BrowserPermissionsApi;

export function requestChromePermission(
  chromePermission: chrome.runtime.ManifestPermissions
): Promise<boolean> {
  return permissionsApi.request({ permissions: [chromePermission] });
}

export function requestOriginPermission(originPattern: string): Promise<boolean> {
  return permissionsApi.request({ origins: [originPattern] });
}

export function requestOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return permissionsApi.request({ origins: originPatterns });
}

export function removeOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return permissionsApi.remove({ origins: originPatterns });
}

export function containsChromePermission(
  chromePermission: chrome.runtime.ManifestPermissions
): Promise<boolean> {
  return permissionsApi.contains({ permissions: [chromePermission] });
}

export function containsOriginPermission(originPattern: string): Promise<boolean> {
  return permissionsApi.contains({ origins: [originPattern] });
}

export function containsOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return permissionsApi.contains({ origins: originPatterns });
}
