import { browserStorage } from '../infrastructure/browser-storage';

const CONTENT_PIN_TO_TAB_SESSION_KEY_PREFIX = 'sniptale.content.pin-to-tab:tab:';

export type PinToTabSessionScope = {
  screenshotModeEnabled: boolean;
  storageKey: string;
};

export type ContentPinToTabSessionWriteGuard = () => boolean;

export function isPinToTabSessionStorageAvailable(): boolean {
  return browserStorage.session.isAvailable();
}

export function createPinToTabSessionStorageKey(tabId: number): string {
  return `${CONTENT_PIN_TO_TAB_SESSION_KEY_PREFIX}${tabId}`;
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

export async function writePinToTabSessionStorageState(
  scope: PinToTabSessionScope,
  value: boolean,
  isCurrent: ContentPinToTabSessionWriteGuard
): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    return;
  }
  if (!isCurrent()) {
    return;
  }
  if (value && !scope.screenshotModeEnabled) {
    return;
  }

  if (!isCurrent()) {
    return;
  }

  if (value) {
    await browserStorage.session.set(createPinToTabSessionDefaults(scope.storageKey, true));
    return;
  }

  await browserStorage.session.remove(scope.storageKey);
}

export async function clearPinToTabSessionStorageState(tabId: number): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    return;
  }

  await browserStorage.session.remove(createPinToTabSessionStorageKey(tabId));
}

export async function clearAllPinToTabSessionStorageState(): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    return;
  }

  const stored = await browserStorage.session.get(null);
  const keys = Object.keys(stored).filter((key) =>
    key.startsWith(CONTENT_PIN_TO_TAB_SESSION_KEY_PREFIX)
  );
  if (keys.length === 0) {
    return;
  }

  await browserStorage.session.remove(keys);
}
