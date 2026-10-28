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
    if (record.kind !== 'sync-operation') continue;
    if (record.phase !== 'native') {
      if (record.phase === 'prepared')
        for (const object of record.prepared.objects) assetIds.add(object.ref.assetId);
      else for (const object of record.objects) if (object.pinned) assetIds.add(object.ref.assetId);
      continue;
    }
    if (record.change.kind === 'media') {
      assetIds.add(record.change.rows.ref.assetId);
      if ('screenshotRef' in record.change.rows)
        assetIds.add(record.change.rows.screenshotRef.assetId);
      continue;
    }
    if (record.change.kind === 'video-review') {
      assetIds.add(record.change.rows.source.ref.assetId);
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
      continue;
    }
    if (record.change.kind === 'image') {
      if (record.change.rows.originalRef) assetIds.add(record.change.rows.originalRef.assetId);
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
      continue;
    }
    if (record.change.kind === 'video-project' || record.change.kind === 'scenario-project')
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
  }
  return { valid, assetIds };
}
