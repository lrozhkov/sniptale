import { isWebSnapshotManifest } from '../../../features/web-snapshot/manifest';
import type { WebSnapshotRecord } from './contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWebSnapshotRecord(value: unknown): value is WebSnapshotRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['id'] === 'string' &&
    value['packageBlob'] instanceof Blob &&
    isWebSnapshotManifest(value['manifest']) &&
    typeof value['createdAt'] === 'number' &&
    typeof value['updatedAt'] === 'number' &&
    typeof value['size'] === 'number'
  );
}
