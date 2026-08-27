import { browserStorage } from '../infrastructure/browser-storage';

export const WEB_SNAPSHOT_CONSENT_STORAGE_KEY = 'sniptale_web_snapshot_local_consent';

export async function loadWebSnapshotConsent(): Promise<boolean> {
  const stored = await browserStorage.local.get([WEB_SNAPSHOT_CONSENT_STORAGE_KEY]);
  return stored[WEB_SNAPSHOT_CONSENT_STORAGE_KEY] === true;
}

export async function saveWebSnapshotConsent(enabled: boolean): Promise<void> {
  await browserStorage.local.set({ [WEB_SNAPSHOT_CONSENT_STORAGE_KEY]: enabled });
}

export async function clearWebSnapshotConsent(): Promise<void> {
  await browserStorage.local.remove([WEB_SNAPSHOT_CONSENT_STORAGE_KEY]);
}
