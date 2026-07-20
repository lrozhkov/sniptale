import { STATE_MANAGER_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

export function applyStateManagerStoreUpgrade(db: UpgradeDatabase, oldVersion: number): void {
  if (oldVersion >= 18 || db.objectStoreNames.contains(STATE_MANAGER_STORE)) {
    return;
  }

  const stateManagerStore = db.createObjectStore(STATE_MANAGER_STORE, {
    keyPath: ['domain', 'key'],
  });
  stateManagerStore.createIndex('domain', 'domain');
  stateManagerStore.createIndex('updatedAtEpochMs', 'updatedAtEpochMs');
}
