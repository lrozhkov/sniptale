import { runtimeInfo } from '@sniptale/platform/browser/runtime';

export function isOwnedExtensionPagePath(senderUrl: string | undefined, path: string): boolean {
  if (!senderUrl) return false;
  try {
    const expectedUrl = new URL(runtimeInfo.getURL(path));
    const actualUrl = new URL(senderUrl);
    return (
      expectedUrl.protocol === actualUrl.protocol &&
      expectedUrl.host === actualUrl.host &&
      expectedUrl.pathname === actualUrl.pathname
    );
  } catch {
    return false;
  }
}
