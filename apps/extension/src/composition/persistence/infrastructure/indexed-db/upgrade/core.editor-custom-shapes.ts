import { EDITOR_CUSTOM_SHAPES_STORE } from '../core.stores.ts';
import type { UpgradeDatabase } from './types';

export function applyEditorCustomShapesStoreUpgrade(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 15) {
    return;
  }

  if (!db.objectStoreNames.contains(EDITOR_CUSTOM_SHAPES_STORE)) {
    const customShapesStore = db.createObjectStore(EDITOR_CUSTOM_SHAPES_STORE, {
      keyPath: 'id',
    });
    customShapesStore.createIndex('enabled', 'enabled');
    customShapesStore.createIndex('updatedAt', 'updatedAt');
  }
}
