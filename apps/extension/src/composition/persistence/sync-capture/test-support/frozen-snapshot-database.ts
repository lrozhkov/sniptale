import type { CapturedVideoProjectRows } from '../contracts';
import type { InventoryDatabase } from '../../../../workflows/media-hub-backup/v6/inventory/helpers';
import type { VideoReviewBackupDatabase } from '../../review-workspaces/backup-restore';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';

interface FrozenSnapshotDatabase extends InventoryDatabase, VideoReviewBackupDatabase {}

/** Supplies the existing backup inventory with one captured source and no live database. */
export function createFrozenSnapshotDatabase(
  source: CapturedVideoProjectRows
): FrozenSnapshotDatabase {
  const snapshot = structuredClone(source);
  const projectId = snapshot.project.id;
  const assetMediaIds = snapshot.assets.map((asset) => `project-asset:${asset.id}`);
  const exportMediaIds = snapshot.exports.map((entry) => `export:${entry.id}`);
  const reviewIds = new Set([...assetMediaIds, ...exportMediaIds]);
  const rows = new Map<string, unknown[]>([
    [VIDEO_PROJECTS_STORE, [snapshot.project]],
    [PROJECT_ASSETS_STORE, snapshot.assets],
    [PROJECT_EXPORTS_STORE, snapshot.exports],
    [MEDIA_LIBRARY_STORE, snapshot.media],
    [ASSET_REFS_STORE, snapshot.refs],
    [THUMBNAILS_STORE, []],
    [AGGREGATE_PRESENTATIONS_STORE, []],
    [VIDEO_WORKSPACES_STORE, []],
    [VIDEO_WORKSPACE_HISTORY_STORE, []],
    [VIDEO_WORKSPACE_DRAFTS_STORE, []],
  ]);
  const allowedKeys = new Map<string, Set<string>>([
    [VIDEO_PROJECTS_STORE, new Set([projectId])],
    [PROJECT_ASSETS_STORE, new Set(snapshot.assets.map((entry) => entry.id))],
    [PROJECT_EXPORTS_STORE, new Set(snapshot.exports.map((entry) => entry.id))],
    [MEDIA_LIBRARY_STORE, new Set([...snapshot.media.map((entry) => entry.id), ...reviewIds])],
    [ASSET_REFS_STORE, new Set(snapshot.refs.map((entry) => entry.assetId))],
    [THUMBNAILS_STORE, new Set([`video-project:${projectId}`, ...exportMediaIds])],
    [AGGREGATE_PRESENTATIONS_STORE, new Set([JSON.stringify(['video-project', projectId])])],
    [VIDEO_WORKSPACES_STORE, reviewIds],
    [VIDEO_WORKSPACE_HISTORY_STORE, reviewIds],
    [VIDEO_WORKSPACE_DRAFTS_STORE, reviewIds],
  ]);
  function readRows(store: string): unknown[] {
    const selected = rows.get(store);
    if (!selected) throw new Error(`Frozen snapshot store is unsupported: ${store}.`);
    return structuredClone(selected);
  }
  function checkedKey(store: string, key: unknown): string {
    const encoded =
      store === AGGREGATE_PRESENTATIONS_STORE &&
      Array.isArray(key) &&
      key.length === 2 &&
      key[0] === 'video-project' &&
      typeof key[1] === 'string'
        ? JSON.stringify(key)
        : typeof key === 'string'
          ? key
          : null;
    if (encoded === null || !allowedKeys.get(store)?.has(encoded))
      throw new Error(`Frozen snapshot key is unsupported for store: ${store}.`);
    return encoded;
  }
  async function get(store: string, key: unknown): Promise<unknown> {
    const selected = readRows(store);
    const accepted = checkedKey(store, key);
    return selected.find((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      return Reflect.get(entry, store === ASSET_REFS_STORE ? 'assetId' : 'id') === accepted;
    });
  }
  async function getAllFromIndex(store: string, index: string, key: unknown): Promise<unknown[]> {
    const selected = readRows(store);
    if (store === PROJECT_EXPORTS_STORE && index === 'projectId' && key === projectId)
      return selected.filter(
        (entry) =>
          typeof entry === 'object' && entry !== null && Reflect.get(entry, 'projectId') === key
      );
    if (store === VIDEO_WORKSPACE_HISTORY_STORE && index === 'aggregateId') {
      checkedKey(store, key);
      return [];
    }
    throw new Error(`Frozen snapshot index is unsupported: ${store}.${index}.`);
  }
  const sidecars = new Set<string>([
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_HISTORY_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
  ]);
  return {
    get,
    getAll: async (store) => readRows(store),
    getAllFromIndex,
    transaction(stores, mode) {
      if (mode !== 'readonly' || !stores.length || stores.some((store) => !sidecars.has(store)))
        throw new Error('Frozen snapshot transaction is unsupported.');
      return {
        done: Promise.resolve(),
        objectStore(store) {
          if (!stores.includes(store))
            throw new Error('Frozen snapshot store is outside the transaction.');
          return {
            get: (key) => get(store, key),
            index: (index) => ({ getAll: (key) => getAllFromIndex(store, index, key) }),
          };
        },
      };
    },
  };
}
