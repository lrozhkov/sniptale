import { projectRowReferenceKeys } from '../../assets/retention-index-projection';
import { projectWorkspaceReferenceKeys } from '../../review-workspaces/index-projection';
import {
  REFERENCE_INDEX_STORES,
  ROW_REFERENCE_FIELD,
  ROW_REFERENCE_INDEX,
  UNKNOWN_HISTORY_REFERENCES,
  withRowReferenceMetadata,
} from './row-index-contract';
import type { DatabaseMigrationSource, UpgradeTransaction } from './upgrade/types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Enqueue the complete native backfill before versionchange can publish its schema. */
export function installDeletionReferenceIndexes(transaction: UpgradeTransaction): undefined {
  for (const name of REFERENCE_INDEX_STORES) {
    const store = transaction.objectStore(name);
    if (!store.createIndex) throw new Error('Deletion reference index creation is unavailable.');
    if (!store.indexNames?.contains(ROW_REFERENCE_INDEX))
      store.createIndex(ROW_REFERENCE_INDEX, ROW_REFERENCE_FIELD, { multiEntry: true });
  }
  const recovery = transaction.objectStore('recording_recovery_sessions');
  if (!recovery.createIndex) throw new Error('Recovery source index creation is unavailable.');
  if (!recovery.indexNames?.contains('recoveryId'))
    recovery.createIndex('recoveryId', 'recoveryId');
  void backfill(transaction).catch(() => {
    try {
      transaction.abort();
    } catch {
      /* A native request can already have aborted the upgrade. */
    }
  });
  return undefined;
}

async function backfill(transaction: UpgradeTransaction): Promise<void> {
  for (const name of REFERENCE_INDEX_STORES) {
    const store = transaction.objectStore(name);
    if (!store.openCursor) throw new Error('Deletion reference backfill is unavailable.');
    let cursor = await store.openCursor();
    while (cursor) {
      await cursor.update(
        withRowReferenceMetadata(cursor.value, projectRowReferenceKeys(name, cursor.value))
      );
      cursor = await cursor.continue();
    }
  }
  const heads = transaction.objectStore('video_workspaces');
  const history = transaction.objectStore('video_workspace_history');
  if (!heads.openCursor || !history.index)
    throw new Error('Workspace reference backfill is unavailable.');
  let cursor = await heads.openCursor();
  while (cursor) {
    const head: unknown = cursor.value;
    if (isRecord(head) && typeof head['aggregateId'] === 'string') {
      const rows = await history.index('aggregateId').getAll(head['aggregateId']);
      const keys = projectWorkspaceReferenceKeys(head, rows);
      await cursor.update(withRowReferenceMetadata(head, keys));
      if (!keys.includes(UNKNOWN_HISTORY_REFERENCES)) {
        for (const row of rows) await history.put(withRowReferenceMetadata(row, []));
      }
    }
    cursor = await cursor.continue();
  }
}

/** Quota admission accounts for the added row metadata and native index key copies. */
export async function estimateDeletionReferenceIndexBytes(
  source?: DatabaseMigrationSource
): Promise<number> {
  if (!source) throw new Error('Deletion reference migration requires source quota inspection.');
  let bytes = 64 * 1024;
  for (const name of REFERENCE_INDEX_STORES) {
    let cursor = await source.transaction(name, 'readonly').store.openCursor();
    while (cursor) {
      const keys = projectRowReferenceKeys(name, cursor.value);
      bytes += 1024 + JSON.stringify(keys).length * 8;
      if (name === 'video_workspaces' || name === 'video_workspace_history')
        bytes += JSON.stringify(cursor.value).length * 8;
      cursor = await cursor.continue();
    }
  }
  return bytes;
}
