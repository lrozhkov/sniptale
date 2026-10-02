import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetOperation } from './contracts';

/** Pending legacy receipts retain both replaced and rollback objects until resolved. */
export function collectBackupRollbackAssetIds(operation: AssetOperation): string[] {
  if (operation.status === 'committed') return [];
  const ids = new Set(operation.obsoleteAssetIds);
  for (const item of operation.compensations) {
    ids.add(item.assetId);
    const previous = item.previousRecords;
    const rows: unknown[] = [previous['assetRefEntry'], previous['assetOwnerEntry']];
    for (const key of ['assetRefEntries', 'assetOwnerEntries']) {
      const values = previous[key];
      if (Array.isArray(values)) {
        const records: unknown[] = values;
        rows.push(...records);
      }
    }
    for (const row of rows)
      if (isRecord(row) && typeof row['assetId'] === 'string' && row['assetId'].length > 0)
        ids.add(row['assetId']);
  }
  return [...ids];
}

/** Prepared shared document refs also retain bytes before their new owner is committed. */
export function readyJournalClaimsAsset(
  journal: import('./contracts').AssetReadyJournal,
  assetId: string
): boolean {
  if (journal.assetRefs.some((ref) => ref.assetId === assetId)) return true;
  const payload = journal.payload;
  if (!isRecord(payload)) return false;
  if (journal.domain === 'image-workspace' && Array.isArray(payload['refs']))
    return payload['refs'].some((ref) => isRecord(ref) && ref['assetId'] === assetId);
  const children = payload['children'];
  if (!isRecord(children)) return false;
  return (
    (Array.isArray(children['assetPuts']) &&
      children['assetPuts'].some((entry) => isRecord(entry) && entry['assetId'] === assetId)) ||
    (Array.isArray(children['editorDocumentPuts']) &&
      children['editorDocumentPuts'].some(
        (entry) =>
          isRecord(entry) &&
          Array.isArray(entry['assetRefs']) &&
          entry['assetRefs'].some((ref) => isRecord(ref) && ref['assetId'] === assetId)
      ))
  );
}
