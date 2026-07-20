import type { WebSnapshotRecord } from '../../../composition/persistence/web-snapshots/contracts';
import { markWebSnapshotProvenanceSanitized } from '../../../composition/persistence/web-snapshots/provenance-state';
import { sanitizeWebSnapshotPackageProvenance } from '../../../features/web-snapshot/provenance';

export async function createBackupWebSnapshotRecord(args: {
  createdAt: number;
  packageBlob: Blob;
  snapshotId: string;
  updatedAt: number;
}): Promise<WebSnapshotRecord> {
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
