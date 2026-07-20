import { VIDEO_EFFECT_BUNDLES_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

const LEGACY_VIDEO_TEMPLATE_PACKS_STORE = 'video_template_packs';

export function applyVideoEffectBundlesStoreUpgrade(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 20) return;
  if (db.objectStoreNames.contains(LEGACY_VIDEO_TEMPLATE_PACKS_STORE)) {
    db.deleteObjectStore(LEGACY_VIDEO_TEMPLATE_PACKS_STORE);
  }
  if (!db.objectStoreNames.contains(VIDEO_EFFECT_BUNDLES_STORE)) {
    const store = db.createObjectStore(VIDEO_EFFECT_BUNDLES_STORE, { keyPath: 'packId' });
    store.createIndex('enabled', 'enabled');
    store.createIndex('updatedAt', 'updatedAt');
  }
}
