import { PROJECT_EXPORT_INPUTS_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

export function applyProjectExportInputsStoreUpgrade(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 21 || db.objectStoreNames.contains(PROJECT_EXPORT_INPUTS_STORE)) return;
  const store = db.createObjectStore(PROJECT_EXPORT_INPUTS_STORE, { keyPath: 'jobId' });
  store.createIndex('createdAt', 'createdAt');
}
