import { isWebSnapshotManifest } from '../../../features/web-snapshot/manifest';
import type { StoredWebSnapshotRecord } from './contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStoredWebSnapshotRecord(value: unknown): StoredWebSnapshotRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value['id'] === 'string' &&
    typeof value['packageAssetId'] === 'string' &&
    value['packageAssetId'].length > 0 &&
    typeof value['screenshotAssetId'] === 'string' &&
    value['screenshotAssetId'].length > 0 &&
    value['packageAssetId'] !== value['screenshotAssetId'] &&
    typeof value['screenshotMimeType'] === 'string' &&
    value['screenshotMimeType'].length > 0 &&
    isWebSnapshotManifest(value['manifest']) &&
    typeof value['createdAt'] === 'number' &&
    typeof value['updatedAt'] === 'number' &&
    typeof value['size'] === 'number' &&
    Number.isFinite(value['size']) &&
    value['size'] >= 0 &&
    typeof value['screenshotSize'] === 'number' &&
    Number.isFinite(value['screenshotSize']) &&
    value['screenshotSize'] >= 0
    ? (value as unknown as StoredWebSnapshotRecord)
    : null;
}

export function isWebSnapshotRecord(value: unknown): value is StoredWebSnapshotRecord {
  return parseStoredWebSnapshotRecord(value) !== null;
}
