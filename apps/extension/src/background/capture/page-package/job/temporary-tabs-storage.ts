import { MAX_PAGE_PACKAGE_URL_SOURCES } from '@sniptale/runtime-contracts/page-package';
import { isCanonicalPopupExportJobId } from '@sniptale/runtime-contracts/export';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';

export const PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY = 'sniptale_page_package_temporary_tabs';

type TemporaryTabsRecord = {
  jobId: string;
  schemaVersion: 1;
  tabIds: number[];
};

// policyStateId: popup-export-jobs
let mutationQueue = Promise.resolve();

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isTabId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseRecord(value: unknown): TemporaryTabsRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    record['schemaVersion'] !== 1 ||
    !isCanonicalPopupExportJobId(record['jobId']) ||
    !isUnknownArray(record['tabIds']) ||
    record['tabIds'].length > MAX_PAGE_PACKAGE_URL_SOURCES ||
    !record['tabIds'].every(isTabId) ||
    new Set(record['tabIds']).size !== record['tabIds'].length
  ) {
    return null;
  }
  return { jobId: record['jobId'], schemaVersion: 1, tabIds: record['tabIds'] };
}

async function readUnlocked(): Promise<TemporaryTabsRecord | null> {
  if (!browserStorage.session.isAvailable()) return null;
  const stored = await browserStorage.session.get([PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY]);
  const value = stored[PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY];
  if (value === undefined) return null;
  const parsed = parseRecord(value);
  if (!parsed) throw new Error('Page Package temporary-tab ownership is invalid.');
  return parsed;
}

export async function readTemporaryPagePackageTabs(): Promise<TemporaryTabsRecord | null> {
  await mutationQueue;
  return structuredClone(await readUnlocked());
}

export function recordTemporaryPagePackageTab(jobId: string, tabId: number): Promise<void> {
  const operation = mutationQueue.then(async () => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Page Package temporary-tab storage is unavailable.');
    }
    const current = await readUnlocked();
    if (current && current.jobId !== jobId) {
      throw new Error('Another Page Package job still owns temporary tabs.');
    }
    const tabIds = current?.tabIds ?? [];
    if (tabIds.includes(tabId)) return;
    if (tabIds.length >= MAX_PAGE_PACKAGE_URL_SOURCES) {
      throw new Error('Page Package temporary-tab ownership exceeds its bound.');
    }
    await browserStorage.session.set({
      [PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY]: {
        jobId,
        schemaVersion: 1,
        tabIds: [...tabIds, tabId],
      },
    });
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export function clearTemporaryPagePackageTabs(jobId: string): Promise<void> {
  const operation = mutationQueue.then(async () => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Page Package temporary-tab storage is unavailable.');
    }
    const current = await readUnlocked();
    if (current?.jobId === jobId) {
      await browserStorage.session.remove(PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY);
    }
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}
