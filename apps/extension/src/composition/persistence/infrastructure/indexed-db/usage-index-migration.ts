import { isPlainRecord as isUnknownRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { DatabaseMigrationSource } from './upgrade/types';
import { PROJECT_ASSETS_STORE, SCENARIO_ASSETS_STORE } from './core.stores';

/** Estimate the one-time native alias indexes before upgrade; derived document keys backfill later. */
export async function estimateUsageIndexBytes(source?: DatabaseMigrationSource): Promise<number> {
  if (!source) throw new Error('Source database unavailable for usage index estimation.');
  let bytes = 64 * 1024;
  for (const name of [PROJECT_ASSETS_STORE, SCENARIO_ASSETS_STORE]) {
    let cursor = await source.transaction(name, 'readonly').store.openCursor();
    while (cursor) {
      bytes += aliasIndexRowBytes(name, cursor.value, cursor.primaryKey);
      cursor = await cursor.continue();
    }
  }
  return bytes;
}

function aliasIndexRowBytes(store: string, value: unknown, primaryKey: IDBValidKey): number {
  if (!isUnknownRecord(value)) return 0;
  const fields =
    store === PROJECT_ASSETS_STORE ? ['originMediaId'] : ['borrowedMediaId', 'galleryAssetId'];
  let bytes = 0;
  for (const field of fields) {
    const alias = value[field];
    if (typeof alias !== 'string') continue;
    if (typeof primaryKey !== 'string') throw new Error('Invalid project usage index key.');
    bytes += 1024 + 4 * (alias.length + primaryKey.length);
  }
  return bytes;
}
