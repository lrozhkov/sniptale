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
      if (
        'recording' in record.change.rows &&
        record.change.rows.telemetry?.recordingEventsSnapshot
      )
        assetIds.add(record.change.rows.telemetry.recordingEventsSnapshot.ref.assetId);
      if (
        'recording' in record.change.rows &&
        record.change.rows.telemetry?.cursorTrajectorySnapshot
      )
        assetIds.add(record.change.rows.telemetry.cursorTrajectorySnapshot.ref.assetId);
      continue;
    }
    if (record.change.kind === 'video-review') {
      assetIds.add(record.change.rows.source.ref.assetId);
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
      if (
        'recording' in record.change.rows.source &&
        record.change.rows.source.telemetry?.recordingEventsSnapshot
      )
        assetIds.add(record.change.rows.source.telemetry.recordingEventsSnapshot.ref.assetId);
      if (
        'recording' in record.change.rows.source &&
        record.change.rows.source.telemetry?.cursorTrajectorySnapshot
      )
        assetIds.add(record.change.rows.source.telemetry.cursorTrajectorySnapshot.ref.assetId);
      continue;
    }
    if (record.change.kind === 'image') {
      if (record.change.rows.originalRef) assetIds.add(record.change.rows.originalRef.assetId);
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
      continue;
    }
    if (record.change.kind === 'video-project' || record.change.kind === 'scenario-project')
      for (const ref of record.change.rows.refs) assetIds.add(ref.assetId);
    if (record.change.kind === 'video-project')
      for (const telemetry of record.change.rows.telemetry ?? []) {
        if (telemetry.cursorTrajectorySnapshot)
          assetIds.add(telemetry.cursorTrajectorySnapshot.ref.assetId);
        if (telemetry.recordingEventsSnapshot)
          assetIds.add(telemetry.recordingEventsSnapshot.ref.assetId);
      }
  }
  return { valid, assetIds };
}
