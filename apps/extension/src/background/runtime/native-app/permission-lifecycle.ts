import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type { NativeAppRuntimeService } from './service-types';

const NATIVE_MESSAGING_PERMISSION = 'nativeMessaging' as const;

function includesNativeMessagingPermission(permissions: chrome.permissions.Permissions): boolean {
  return permissions.permissions?.includes(NATIVE_MESSAGING_PERMISSION) === true;
}

export function hasNativeMessagingPermission(): Promise<boolean> {
  return browserPermissions.contains({ permissions: [NATIVE_MESSAGING_PERMISSION] });
}

export function initializeNativeAppPermissionLifecycle(
  service: NativeAppRuntimeService
): () => void {
  let active = true;
  let generation = 0;

  const reconcile = async () => {
    const requestGeneration = ++generation;
    const granted = await hasNativeMessagingPermission().catch(() => false);
    if (!active || requestGeneration !== generation) return;
    if (granted) {
      service.connect();
    } else {
      service.disconnectForPermissionRevocation();
    }
  };

  const handlePermissionChange = (permissions: chrome.permissions.Permissions) => {
    if (includesNativeMessagingPermission(permissions)) void reconcile();
  };
  const unsubscribeAdded = browserPermissions.subscribeToAdded(handlePermissionChange);
  const unsubscribeRemoved = browserPermissions.subscribeToRemoved(handlePermissionChange);
  void reconcile();

  return () => {
    active = false;
    generation += 1;
    unsubscribeAdded();
    unsubscribeRemoved();
  };
}
