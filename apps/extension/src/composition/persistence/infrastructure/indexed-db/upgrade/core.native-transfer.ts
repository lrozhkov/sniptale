import { NATIVE_TRANSFER_CHUNKS_STORE, NATIVE_TRANSFER_SESSIONS_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

export function applyNativeTransferStoresUpgrade(db: UpgradeDatabase, oldVersion: number): void {
  if (oldVersion >= 19) {
    return;
  }
  if (!db.objectStoreNames.contains(NATIVE_TRANSFER_SESSIONS_STORE)) {
    const sessionsStore = db.createObjectStore(NATIVE_TRANSFER_SESSIONS_STORE, { keyPath: 'id' });
    sessionsStore.createIndex('createdAt', 'createdAt');
    sessionsStore.createIndex('updatedAt', 'updatedAt');
  }
  if (!db.objectStoreNames.contains(NATIVE_TRANSFER_CHUNKS_STORE)) {
    const chunksStore = db.createObjectStore(NATIVE_TRANSFER_CHUNKS_STORE, {
      keyPath: ['sessionId', 'chunkIndex'],
    });
    chunksStore.createIndex('sessionId', 'sessionId');
  }
}
