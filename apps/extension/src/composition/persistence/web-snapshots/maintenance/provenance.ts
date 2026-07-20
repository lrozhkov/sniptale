import { WEB_SNAPSHOTS_STORE } from '../../infrastructure/indexed-db/core.stores.ts';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  sanitizeWebSnapshotManifestProvenance,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../../features/web-snapshot/provenance';
import { isWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import {
  WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE,
  WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD,
  WEB_SNAPSHOT_PROVENANCE_VERSION,
  WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD,
} from '../provenance-state';
import {
  createMaintenanceLeaseToken,
  leaseCurrentWebSnapshotRecord,
  putLeasedWebSnapshotRecord,
} from '../../infrastructure/indexed-db/maintenance/web-snapshot-lease';
import type {
  MaintenanceCandidate,
  MaintenanceDatabase,
} from '../../infrastructure/indexed-db/maintenance/contracts';

type MaintenanceSanitizeResult = {
  changed: boolean;
  value: unknown;
};
type WebSnapshotMaintenancePlan = 'package' | 'record' | 'skip';

export async function sanitizeWebSnapshotStoreProvenanceUrls(
  db: MaintenanceDatabase
): Promise<void> {
  const candidates = await collectStoreCandidates(db);
  let packageCount = 0;
  for (const candidate of candidates) {
    const plan = planWebSnapshotMaintenance(candidate.value);
    if (candidate.key === undefined || plan === 'skip') {
      continue;
    }
    if (plan === 'package' && packageCount >= WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE) {
      continue;
    }
    if (plan === 'package') {
      packageCount += 1;
    }

    await sanitizeLeasedWebSnapshotRecord(db, candidate.key);
  }
}

async function sanitizeLeasedWebSnapshotRecord(
  db: MaintenanceDatabase,
  key: IDBValidKey
): Promise<void> {
  const leaseToken = createMaintenanceLeaseToken();
  const leasedValue = await leaseCurrentWebSnapshotRecord(db, key, leaseToken);
  if (!leasedValue) {
    return;
  }

  const currentPlan = planWebSnapshotMaintenance(leasedValue);
  const result = await sanitizeWebSnapshotRecord(leasedValue, currentPlan).catch(() =>
    unchangedResult(leasedValue)
  );
  await putLeasedWebSnapshotRecord(db, key, leaseToken, result.value);
}

async function sanitizeWebSnapshotRecord(
  value: unknown,
  plan: WebSnapshotMaintenancePlan
): Promise<MaintenanceSanitizeResult> {
  if (!isRecord(value) || !isRecord(value['manifest'])) {
    return unchangedResult(value);
  }

  const manifest = value['manifest'];
  if (!isRecord(manifest['source'])) {
    return unchangedResult(value);
  }

  if (isWebSnapshotManifest(manifest)) {
    const sanitizedManifest = sanitizeWebSnapshotManifestProvenance(manifest);
    if (plan === 'package' && value['packageBlob'] instanceof Blob) {
      return sanitizeWebSnapshotPackageRecord(value, sanitizedManifest);
    }
    return jsonResult(value, { ...value, manifest: sanitizedManifest });
  }

  return jsonResult(value, { ...value, manifest: sanitizeWebSnapshotRecordManifest(manifest) });
}

async function sanitizeWebSnapshotPackageRecord(
  value: Record<string, unknown>,
  sanitizedManifest: ReturnType<typeof sanitizeWebSnapshotManifestProvenance>
): Promise<MaintenanceSanitizeResult> {
  try {
    const sanitizedPackage = await sanitizeWebSnapshotPackageProvenance(
      value['packageBlob'] as Blob,
      sanitizedManifest
    );
    const { [WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD]: _failed, ...recordWithoutFailure } = value;
    return webSnapshotResult(
      value,
      {
        ...recordWithoutFailure,
        manifest: sanitizedPackage.manifest,
        packageBlob: sanitizedPackage.packageBlob,
        [WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
        size: sanitizedPackage.size,
      },
      sanitizedPackage.changed
    );
  } catch {
    return webSnapshotResult(value, {
      ...value,
      manifest: sanitizedManifest,
      [WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
    });
  }
}

function planWebSnapshotMaintenance(value: unknown): WebSnapshotMaintenancePlan {
  if (!isRecord(value) || !isRecord(value['manifest'])) {
    return 'skip';
  }

  if (shouldSanitizeWebSnapshotRecordManifest(value['manifest'])) {
    return value['packageBlob'] instanceof Blob ? 'package' : 'record';
  }

  if (value['packageBlob'] instanceof Blob && !hasWebSnapshotPackageMaintenanceMarker(value)) {
    return 'package';
  }

  return 'skip';
}

function shouldSanitizeWebSnapshotRecordManifest(manifest: Record<string, unknown>): boolean {
  if (!isRecord(manifest['source'])) {
    return false;
  }

  const sanitizedManifest = isWebSnapshotManifest(manifest)
    ? sanitizeWebSnapshotManifestProvenance(manifest)
    : sanitizeWebSnapshotRecordManifest(manifest);
  return didRecordChange(manifest, sanitizedManifest);
}

function sanitizeWebSnapshotRecordManifest(
  manifest: Record<string, unknown>
): Record<string, unknown> {
  const source = isRecord(manifest['source']) ? manifest['source'] : {};
  return {
    ...manifest,
    source: {
      ...source,
      faviconUrl: sanitizeUrlField(source['faviconUrl']),
      url: sanitizeUrlField(source['url']),
    },
  };
}

function hasWebSnapshotPackageMaintenanceMarker(value: Record<string, unknown>): boolean {
  return (
    value[WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD] === WEB_SNAPSHOT_PROVENANCE_VERSION ||
    value[WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD] === WEB_SNAPSHOT_PROVENANCE_VERSION
  );
}

function webSnapshotResult(
  previousValue: Record<string, unknown>,
  nextValue: Record<string, unknown>,
  packageChanged = false
): MaintenanceSanitizeResult {
  return {
    changed: packageChanged || didRecordChange(previousValue, nextValue),
    value: nextValue,
  };
}

async function collectStoreCandidates(db: MaintenanceDatabase): Promise<MaintenanceCandidate[]> {
  const tx = db.transaction(WEB_SNAPSHOTS_STORE, 'readonly');
  const candidates: MaintenanceCandidate[] = [];
  let cursor = await tx.objectStore(WEB_SNAPSHOTS_STORE).openCursor();
  while (cursor) {
    candidates.push({ key: cursor.primaryKey, value: cursor.value });
    cursor = await cursor.continue();
  }
  await tx.done;
  return candidates;
}

function sanitizeUrlField(value: unknown): string | null {
  return typeof value === 'string' ? sanitizeProvenanceUrl(value) : null;
}

function didRecordChange(previousValue: unknown, nextValue: unknown): boolean {
  return JSON.stringify(previousValue) !== JSON.stringify(nextValue);
}

function unchangedResult(value: unknown): MaintenanceSanitizeResult {
  return { changed: false, value };
}

function jsonResult(previousValue: unknown, nextValue: unknown): MaintenanceSanitizeResult {
  return {
    changed: didRecordChange(previousValue, nextValue),
    value: nextValue,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
