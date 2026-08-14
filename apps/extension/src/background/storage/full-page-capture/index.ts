import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
// policyStateId: full-page-capture-leases - durable session record for interrupted DOM restoration.
import type { FullPageCaptureBackendKind } from '../../../contracts/full-page-capture';

const FULL_PAGE_CAPTURE_LEASE_KEY = 'sniptale_native_full_page_capture_lease';
const RETIRED_FULL_PAGE_CAPTURE_LEASE_KEY = 'sniptale_full_page_capture_lease';

export type StoredFullPageCaptureLease = {
  backendKind: FullPageCaptureBackendKind;
  documentId: string;
  expiresAtEpochMs: number;
  exportRunId?: string;
  jobId: string;
  ownerToken: string;
  runtimeGeneration: string;
  tabId: number;
};

function isStoredFullPageCaptureLease(value: unknown): value is StoredFullPageCaptureLease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record['backendKind'] === 'native' &&
    typeof record['documentId'] === 'string' &&
    typeof record['expiresAtEpochMs'] === 'number' &&
    Number.isFinite(record['expiresAtEpochMs']) &&
    (record['exportRunId'] === undefined || typeof record['exportRunId'] === 'string') &&
    typeof record['jobId'] === 'string' &&
    typeof record['ownerToken'] === 'string' &&
    typeof record['runtimeGeneration'] === 'string' &&
    typeof record['tabId'] === 'number' &&
    Number.isSafeInteger(record['tabId']) &&
    record['tabId'] >= 0
  );
}

export async function readStoredFullPageCaptureLease(): Promise<StoredFullPageCaptureLease | null> {
  if (!browserStorage.session.isAvailable()) return null;
  const stored = await browserStorage.session.get([FULL_PAGE_CAPTURE_LEASE_KEY]);
  const candidate = stored[FULL_PAGE_CAPTURE_LEASE_KEY];
  return isStoredFullPageCaptureLease(candidate) ? candidate : null;
}

export async function writeStoredFullPageCaptureLease(
  lease: StoredFullPageCaptureLease
): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    throw new Error('Session storage is unavailable for full-page capture');
  }
  await browserStorage.session.set({ [FULL_PAGE_CAPTURE_LEASE_KEY]: lease });
}

export async function clearStoredFullPageCaptureLease(ownerToken?: string): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  if (ownerToken !== undefined) {
    const current = await readStoredFullPageCaptureLease();
    if (!current || current.ownerToken !== ownerToken) return;
  }
  await browserStorage.session.remove(FULL_PAGE_CAPTURE_LEASE_KEY);
}

export async function clearRetiredFullPageCaptureLease(): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  await browserStorage.session.remove(RETIRED_FULL_PAGE_CAPTURE_LEASE_KEY);
}
