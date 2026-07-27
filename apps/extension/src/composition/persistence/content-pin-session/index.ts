import { browserStorage } from '../infrastructure/browser-storage';

const CONTENT_PIN_TO_TAB_SESSION_KEY_PREFIX = 'sniptale.content.pin-to-tab:tab:';
const CONTENT_PIN_TO_TAB_TOOLBAR_VISIBILITY_SESSION_KEY_PREFIX =
  'sniptale.content.pin-to-tab-toolbar-visible:tab:';

export type PinToTabSessionScope = {
  storageKey: string;
};

export type ContentPinToTabSessionWriteGuard = () => boolean;

export function isPinToTabSessionStorageAvailable(): boolean {
  return browserStorage.session.isAvailable();
}

export function createPinToTabSessionStorageKey(tabId: number): string {
  return `${CONTENT_PIN_TO_TAB_SESSION_KEY_PREFIX}${tabId}`;
}

export function createPinToTabToolbarVisibilitySessionStorageKey(tabId: number): string {
  return `${CONTENT_PIN_TO_TAB_TOOLBAR_VISIBILITY_SESSION_KEY_PREFIX}${tabId}`;
}

function getPinToTabSessionStorageErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    return typeof message === 'string' ? message : null;
  }

  return null;
}

export function isPinToTabSessionStorageAccessDeniedError(error: unknown): boolean {
  return (
    getPinToTabSessionStorageErrorMessage(error)?.includes(
      'Access to storage is not allowed from this context.'
    ) === true
  );
}

function createPinToTabSessionDefaults(storageKey: string, fallbackValue: boolean) {
  return {
    [storageKey]: fallbackValue,
  };
}

export async function loadPinToTabSessionStorageState(
  scope: PinToTabSessionScope
): Promise<boolean> {
  const stored = await browserStorage.session.get(
    createPinToTabSessionDefaults(scope.storageKey, false)
  );

  return stored[scope.storageKey] === true;
}

export async function readPinToTabSessionStorageState(tabId: number): Promise<boolean> {
  if (!browserStorage.session.isAvailable()) {
    return false;
  }

  const storageKey = createPinToTabSessionStorageKey(tabId);
  const stored = await browserStorage.session.get(createPinToTabSessionDefaults(storageKey, false));
  return stored[storageKey] === true;
}

export async function readPinToTabToolbarVisibilitySessionStorageState(
  tabId: number
): Promise<boolean> {
  if (!browserStorage.session.isAvailable()) {
    return true;
  }

  const storageKey = createPinToTabToolbarVisibilitySessionStorageKey(tabId);
  const stored = await browserStorage.session.get(createPinToTabSessionDefaults(storageKey, true));
  return stored[storageKey] !== false;
}

export type PinToTabSessionStorageMutation =
  | { pinToTab: false }
  | { pinToTab: true; toolbarVisible: boolean }
  | { toolbarVisible: boolean };

export async function writePinToTabSessionStorageState(
  tabId: number,
  mutation: PinToTabSessionStorageMutation,
  isCurrent: ContentPinToTabSessionWriteGuard
): Promise<void> {
  if (!browserStorage.session.isAvailable() || !isCurrent()) {
    return;
  }

  const pinStorageKey = createPinToTabSessionStorageKey(tabId);
  const visibilityStorageKey = createPinToTabToolbarVisibilitySessionStorageKey(tabId);
  if ('pinToTab' in mutation) {
    if (!mutation.pinToTab) {
      await browserStorage.session.remove([pinStorageKey, visibilityStorageKey]);
      return;
    }

    await browserStorage.session.set({
      [pinStorageKey]: true,
      [visibilityStorageKey]: mutation.toolbarVisible,
    });
    return;
  }

  await browserStorage.session.set({ [visibilityStorageKey]: mutation.toolbarVisible });
}

export async function clearPinToTabSessionStorageState(tabId: number): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    return;
  }

  await browserStorage.session.remove([
    createPinToTabSessionStorageKey(tabId),
    createPinToTabToolbarVisibilitySessionStorageKey(tabId),
  ]);
}
