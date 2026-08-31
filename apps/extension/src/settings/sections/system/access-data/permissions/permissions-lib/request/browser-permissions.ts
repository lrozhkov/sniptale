import { browserPermissions } from '@sniptale/platform/browser/permissions';

export function requestChromePermission(
  chromePermission: chrome.runtime.ManifestPermission
): Promise<boolean> {
  return browserPermissions.request({ permissions: [chromePermission] });
}

export function requestOriginPermission(originPattern: string): Promise<boolean> {
  return browserPermissions.request({ origins: [originPattern] });
}

export function requestOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return browserPermissions.request({ origins: originPatterns });
}

export function removeOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return browserPermissions.remove({ origins: originPatterns });
}

export function removeChromePermission(
  chromePermission: chrome.runtime.ManifestPermission
): Promise<boolean> {
  return browserPermissions.remove({ permissions: [chromePermission] });
}

export function containsChromePermission(
  chromePermission: chrome.runtime.ManifestPermission
): Promise<boolean> {
  return browserPermissions.contains({ permissions: [chromePermission] });
}

export function containsOriginPermission(originPattern: string): Promise<boolean> {
  return browserPermissions.contains({ origins: [originPattern] });
}

export function containsOriginPermissions(originPatterns: string[]): Promise<boolean> {
  return browserPermissions.contains({ origins: originPatterns });
}
