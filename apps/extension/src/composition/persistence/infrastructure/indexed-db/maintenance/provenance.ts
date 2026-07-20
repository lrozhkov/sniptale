import { EDITOR_SESSIONS_STORE, MEDIA_LIBRARY_STORE } from '../core.stores.ts';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { patchRecord } from './record-patch';
import { sanitizeWebSnapshotStoreProvenanceUrls } from '../../../web-snapshots/maintenance/provenance';
import type { MaintenanceCandidate, MaintenanceDatabase } from './contracts';

type MaintenanceSanitizeResult = {
  applyToCurrent?: ((currentValue: unknown) => unknown) | undefined;
  changed: boolean;
  value: unknown;
};

export async function runProvenanceUrlMaintenance(db: MaintenanceDatabase): Promise<void> {
  await sanitizeStoreProvenanceUrls(db, MEDIA_LIBRARY_STORE, sanitizeMediaLibraryRecord);
  await sanitizeStoreProvenanceUrls(db, EDITOR_SESSIONS_STORE, sanitizeEditorSessionRecord);
  await sanitizeWebSnapshotStoreProvenanceUrls(db);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeUrlField(value: unknown): string | null {
  return typeof value === 'string' ? sanitizeProvenanceUrl(value) : null;
}

function sanitizeMediaLibraryRecord(value: unknown): MaintenanceSanitizeResult {
  if (!isRecord(value)) {
    return unchangedResult(value);
  }

  return patchRecord(value, {
    sourceFavicon: sanitizeUrlField,
    sourceUrl: sanitizeUrlField,
  });
}

function sanitizeEditorSessionRecord(value: unknown): MaintenanceSanitizeResult {
  if (!isRecord(value)) {
    return unchangedResult(value);
  }

  return patchRecord(value, { sourceUrl: sanitizeUrlField });
}

function didRecordChange(previousValue: unknown, nextValue: unknown): boolean {
  return JSON.stringify(previousValue) !== JSON.stringify(nextValue);
}

function unchangedResult(value: unknown): MaintenanceSanitizeResult {
  return { changed: false, value };
}

async function sanitizeStoreProvenanceUrls(
  db: MaintenanceDatabase,
  storeName: string,
  sanitizeRecord: (value: unknown) => MaintenanceSanitizeResult | Promise<MaintenanceSanitizeResult>
): Promise<void> {
  const candidates = await collectStoreCandidates(db, storeName);
  for (const candidate of candidates) {
    const result = await Promise.resolve(sanitizeRecord(candidate.value)).catch(() =>
      unchangedResult(candidate.value)
    );
    if (result.changed) {
      await putCurrentRecord(db, storeName, candidate, result);
    }
  }
}

async function collectStoreCandidates(
  db: MaintenanceDatabase,
  storeName: string
): Promise<MaintenanceCandidate[]> {
  const tx = db.transaction(storeName, 'readonly');
  const candidates: MaintenanceCandidate[] = [];
  let cursor = await tx.objectStore(storeName).openCursor();
  while (cursor) {
    candidates.push({ key: cursor.primaryKey, value: cursor.value });
    cursor = await cursor.continue();
  }
  await tx.done;
  return candidates;
}

async function putCurrentRecord(
  db: MaintenanceDatabase,
  storeName: string,
  candidate: MaintenanceCandidate,
  result: MaintenanceSanitizeResult
): Promise<void> {
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const currentValue =
    candidate.key === undefined || !store.get ? candidate.value : await store.get(candidate.key);
  if (!result.applyToCurrent && didRecordChange(candidate.value, currentValue)) {
    await tx.done;
    return;
  }

  if (!store.put) {
    await tx.done;
    return;
  }

  await store.put(result.applyToCurrent ? result.applyToCurrent(currentValue) : result.value);
  await tx.done;
}
