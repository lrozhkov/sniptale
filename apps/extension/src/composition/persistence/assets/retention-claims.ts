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

/** Include prepared shared refs whose new owner has not committed yet. */
export function collectReadyJournalAssetIds(
  journal: import('./contracts').AssetReadyJournal
): string[] {
  const ids = new Set(journal.assetRefs.map((ref) => ref.assetId));
  const add = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows)
      if (isRecord(row) && typeof row['assetId'] === 'string') ids.add(row['assetId']);
  };
  const payload = journal.payload;
  if (!isRecord(payload)) return [...ids];
  if (journal.domain === 'image-workspace') add(payload['refs']);
  const children = payload['children'];
  if (isRecord(children)) {
    add(children['assetPuts']);
    if (Array.isArray(children['editorDocumentPuts']))
      for (const row of children['editorDocumentPuts']) {
        if (isRecord(row)) add(row['assetRefs']);
      }
  }
  return [...ids];
}

/** Prepared shared document refs also retain bytes before their new owner is committed. */
export function readyJournalClaimsAsset(
  journal: import('./contracts').AssetReadyJournal,
  assetId: string
): boolean {
  return collectReadyJournalAssetIds(journal).includes(assetId);
}
