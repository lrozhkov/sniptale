import { runChromeCallback, subscribeToChromeEvent } from './callback';

type BrowserPermissionListener = typeof chrome.permissions.onAdded.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

/**
 * Shared browser permissions seam for optional extension permissions and listeners.
 */
interface BrowserPermissionsAdapter {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  getAll(): Promise<chrome.permissions.Permissions>;
  isAvailable(): boolean;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  subscribeToAdded(listener: BrowserPermissionListener): () => void;
  subscribeToRemoved(listener: BrowserPermissionListener): () => void;
}

export const browserPermissions: BrowserPermissionsAdapter = {
  contains(permissions) {
    if (typeof chrome === 'undefined' || !chrome.permissions) {
      return Promise.reject(new Error('chrome.permissions is unavailable'));
    }

    return runChromeCallback<boolean>(
      (callback) => chrome.permissions.contains(permissions, callback),
      'chrome.permissions is unavailable'
    );
  },

  getAll() {
    if (typeof chrome === 'undefined' || !chrome.permissions) {
      return Promise.reject(new Error('chrome.permissions is unavailable'));
    }

    return runChromeCallback<chrome.permissions.Permissions>(
      (callback) => chrome.permissions.getAll(callback),
      'chrome.permissions is unavailable'
    );
  },

  isAvailable() {
    return typeof chrome !== 'undefined' && Boolean(chrome.permissions);
  },

  remove(permissions) {
    if (typeof chrome === 'undefined' || !chrome.permissions) {
      return Promise.reject(new Error('chrome.permissions is unavailable'));
    }

    return runChromeCallback<boolean>(
      (callback) => chrome.permissions.remove(permissions, callback),
      'chrome.permissions is unavailable'
    );
  },

  request(permissions) {
    if (typeof chrome === 'undefined' || !chrome.permissions) {
      return Promise.reject(new Error('chrome.permissions is unavailable'));
    }

    return runChromeCallback<boolean>(
      (callback) => chrome.permissions.request(permissions, callback),
      'chrome.permissions is unavailable'
    );
  },

  subscribeToAdded(listener) {
    return subscribeToChromeEvent(chrome.permissions?.onAdded, listener);
  },

  subscribeToRemoved(listener) {
    return subscribeToChromeEvent(chrome.permissions?.onRemoved, listener);
  },
};

export async function getMissingOriginPermissions(origins: readonly string[]): Promise<string[]> {
  const checks = await Promise.all(
    origins.map(async (origin) => ({
      granted: await browserPermissions.contains({ origins: [origin] }),
      origin,
    }))
  );

  return checks.filter((check) => !check.granted).map((check) => check.origin);
}
