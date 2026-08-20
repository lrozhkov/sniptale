import { markWebSnapshotProvenanceSanitized } from '../../../composition/persistence/web-snapshots/provenance-state';
import {
  readSanitizedWebSnapshotScreenshot,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../features/web-snapshot/provenance';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

export interface PreparedBackupWebSnapshotRecord {
  createdAt: number;
  id: string;
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  size: number;
  updatedAt: number;
}

export async function createBackupWebSnapshotRecord(args: {
  createdAt: number;
  packageBlob: Blob;
  snapshotId: string;
  updatedAt: number;
}): Promise<PreparedBackupWebSnapshotRecord> {
  const sanitizedPackage = await sanitizeWebSnapshotPackageProvenance(args.packageBlob);

  return markWebSnapshotProvenanceSanitized({
    createdAt: args.createdAt,
    id: args.snapshotId,
    manifest: sanitizedPackage.manifest,
    packageBlob: sanitizedPackage.packageBlob,
    size: sanitizedPackage.size,
    updatedAt: args.updatedAt,
  });
}

export async function readBackupWebSnapshotScreenshot(
  record: PreparedBackupWebSnapshotRecord
): Promise<Blob> {
  return readSanitizedWebSnapshotScreenshot(record.packageBlob);
}
