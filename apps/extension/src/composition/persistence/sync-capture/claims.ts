import { parseSyncCaptureRecord } from './guards';

/** Capture rows own their retention claims, including after domain refs are deleted. */
export function collectSyncCaptureClaims(raw: unknown): {
  valid: boolean;
  assetIds: Set<string>;
} {
  if (!Array.isArray(raw)) return { valid: false, assetIds: new Set() };
  const assetIds = new Set<string>();
  let valid = true;
  for (const value of raw) {
    const record = parseSyncCaptureRecord(value);
    if (!record) {
      valid = false;
      continue;
    }
    if (record.kind !== 'captured-change') continue;
    if (record.change.kind === 'media') {
      assetIds.add(record.change.rows.ref.assetId);
      continue;
    }
    if (record.change.kind === 'video-project')
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
  }
  return { valid, assetIds };
}
