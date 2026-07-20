import { PAGE_STYLE_ASSETS_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

export function applyPageStyleAssetsStoreUpgrade(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 14) {
    return;
  }

  if (!db.objectStoreNames.contains(PAGE_STYLE_ASSETS_STORE)) {
    const pageStyleAssetsStore = db.createObjectStore(PAGE_STYLE_ASSETS_STORE, {
      keyPath: 'id',
    });
    pageStyleAssetsStore.createIndex('createdAt', 'createdAt');
    pageStyleAssetsStore.createIndex('kind', 'kind');
  }
}
